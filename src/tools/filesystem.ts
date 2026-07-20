import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { configManager } from '../config-manager.js';
import type { FileInfo, FileResult, ReadOptions } from '../utils/files/base.js';
import { getFileHandler, TextFileHandler } from '../utils/files/index.js';
import { runWithAbortableTimeout, withTimeout } from '../utils/withTimeout.js';

const PATH_VALIDATION_TIMEOUT_MS = 10_000;
export const READ_OPERATION_TIMEOUT_MS = 3 * 60 * 1000;

function expandHome(filePath: string): string {
  if (filePath === '~' || filePath.startsWith('~/') || filePath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

async function getAllowedDirectories(): Promise<string[]> {
  const config = await configManager.getConfig();
  return Array.isArray(config.allowedDirectories) ? config.allowedDirectories : [];
}

function normalizePath(filePath: string): string {
  return path.normalize(expandHome(filePath)).toLowerCase();
}

async function isPathAllowed(filePath: string): Promise<boolean> {
  const allowedDirectories = await getAllowedDirectories();
  if (allowedDirectories.length === 0 || allowedDirectories.includes('/')) return true;

  let normalizedPath = normalizePath(filePath);
  if (normalizedPath.endsWith(path.sep)) normalizedPath = normalizedPath.slice(0, -1);

  return allowedDirectories.some((allowedDirectory) => {
    let normalizedRoot = normalizePath(allowedDirectory);
    if (normalizedRoot.endsWith(path.sep)) normalizedRoot = normalizedRoot.slice(0, -1);

    if (normalizedPath === normalizedRoot) return true;
    if (normalizedPath.startsWith(`${normalizedRoot}${path.sep}`)) return true;
    if (process.platform === 'win32' && /^[a-z]:$/.test(normalizedRoot)) {
      return normalizedPath.startsWith(normalizedRoot);
    }
    return false;
  });
}

async function resolveThroughExistingAncestor(absolutePath: string): Promise<string> {
  let current = absolutePath;
  const remaining: string[] = [];

  while (true) {
    try {
      const resolved = await fs.realpath(current);
      return path.join(resolved, ...remaining);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== 'ENOENT') throw error;
    }

    const parent = path.dirname(current);
    if (parent === current) return absolutePath;
    remaining.unshift(path.basename(current));
    current = parent;
  }
}

export async function validatePath(requestedPath: string): Promise<string> {
  if (!requestedPath || typeof requestedPath !== 'string') {
    throw new Error('A non-empty path is required.');
  }

  const operation = async (): Promise<string> => {
    const expanded = expandHome(requestedPath);
    const absolutePath = path.isAbsolute(expanded)
      ? path.resolve(expanded)
      : path.resolve(process.cwd(), expanded);
    const resolvedPath = await resolveThroughExistingAncestor(absolutePath);

    if (!(await isPathAllowed(resolvedPath))) {
      const allowedDirectories = await getAllowedDirectories();
      throw new Error(
        `Path not allowed: ${requestedPath}. Allowed directories: ${allowedDirectories.join(', ')}`,
      );
    }

    return resolvedPath;
  };

  const result = await withTimeout(
    operation(),
    PATH_VALIDATION_TIMEOUT_MS,
    'Path validation operation',
    null,
  );

  if (result === null) {
    throw new Error(`Path validation timed out: ${requestedPath}`);
  }
  return result;
}

function permissionError(filePath: string, code: string | undefined): Error {
  const reason = code === 'ETIMEDOUT' ? 'operation timed out' : 'permission denied';
  return new Error(
    `Cannot read local file: ${reason} (${code ?? 'unknown'}). Path: ${filePath}. ` +
      'Check local availability, filesystem permissions, file locks, and mounted-drive state.',
  );
}

async function defaultReadLength(): Promise<number> {
  return (await configManager.getConfig()).fileReadLineLimit;
}

function textContent(result: FileResult): string {
  return typeof result.content === 'string' ? result.content : result.content.toString('utf8');
}

export async function readFile(
  filePath: string,
  options: ReadOptions = {},
): Promise<FileResult> {
  const validPath = await validatePath(filePath);
  const offset = options.offset ?? 0;
  const length = options.length ?? (await defaultReadLength());

  try {
    const stats = await fs.stat(validPath);
    if (stats.isDirectory()) {
      const listing = await listDirectory(validPath);
      return {
        content:
          'This path is a directory. Use list_directory for directory traversal.\n\n' +
          listing.join('\n'),
        mimeType: 'text/plain',
        metadata: { isDirectory: true },
      };
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }

  try {
    const result = await runWithAbortableTimeout(
      async (signal) => {
        const handler = await getFileHandler(validPath);
        const handled = await handler.read(validPath, {
          offset,
          length,
          includeStatusMessage: true,
          signal,
        });
        return {
          ...handled,
          content: textContent(handled),
        };
      },
      READ_OPERATION_TIMEOUT_MS,
      `Read local file ${filePath}`,
    );

    if (!result) throw new Error(`Failed to read local file: ${filePath}`);
    return result;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'ETIMEDOUT') {
      throw permissionError(filePath, code);
    }
    throw error;
  }
}

export async function readFileInternal(
  filePath: string,
  offset = 0,
  length = Number.MAX_SAFE_INTEGER,
): Promise<string> {
  const validPath = await validatePath(filePath);
  const handler = await getFileHandler(validPath);
  if (!(handler instanceof TextFileHandler)) {
    throw new Error('Binary files cannot be read as editable text.');
  }

  const content = await runWithAbortableTimeout(
    (signal) => fs.readFile(validPath, { encoding: 'utf8', signal }),
    READ_OPERATION_TIMEOUT_MS,
    `Internal local text read ${filePath}`,
  );

  if (offset === 0 && length >= Number.MAX_SAFE_INTEGER) return content;

  const lines = TextFileHandler.splitLinesPreservingEndings(content);
  if (offset < 0) return lines.slice(offset).join('');
  return lines.slice(offset, offset + length).join('');
}

export async function writeFile(
  filePath: string,
  content: string,
  mode: 'rewrite' | 'append' = 'rewrite',
): Promise<void> {
  const validPath = await validatePath(filePath);
  const handler = await getFileHandler(validPath);
  await handler.write(validPath, content, mode);
}

export async function createDirectory(directoryPath: string): Promise<void> {
  const validPath = await validatePath(directoryPath);
  await fs.mkdir(validPath, { recursive: true });
}

export async function listDirectory(
  directoryPath: string,
  depth = 2,
): Promise<string[]> {
  const validPath = await validatePath(directoryPath);
  const results: string[] = [];
  const maxNestedItems = 100;

  async function visit(
    currentPath: string,
    remainingDepth: number,
    relativePath = '',
    topLevel = true,
  ): Promise<void> {
    if (remainingDepth <= 0) return;

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const displayPath = relativePath || path.basename(currentPath);
      if (code === 'ENOENT') {
        results.push(`[NOT_FOUND] ${displayPath} — path does not exist`);
      } else {
        results.push(`[DENIED] ${displayPath} — path is not accessible`);
      }
      return;
    }

    const shown = !topLevel && entries.length > maxNestedItems
      ? entries.slice(0, maxNestedItems)
      : entries;

    for (const entry of shown) {
      const fullPath = path.join(currentPath, entry.name);
      const displayPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      results.push(`${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${displayPath}`);

      if (entry.isDirectory() && remainingDepth > 1) {
        try {
          await validatePath(fullPath);
          await visit(fullPath, remainingDepth - 1, displayPath, false);
        } catch {
          results.push(`[DENIED] ${displayPath} — path is not allowed`);
        }
      }
    }

    if (shown.length < entries.length) {
      const displayPath = relativePath || path.basename(currentPath);
      results.push(
        `[WARNING] ${displayPath}: ${entries.length - shown.length} items hidden ` +
          `(showing first ${shown.length} of ${entries.length})`,
      );
    }
  }

  await visit(validPath, Math.max(1, Math.floor(depth)));
  return results;
}

export async function moveFile(sourcePath: string, destinationPath: string): Promise<void> {
  const validSource = await validatePath(sourcePath);
  const validDestination = await validatePath(destinationPath);
  await fs.rename(validSource, validDestination);
}

export interface LocalFileInfo extends Omit<FileInfo, 'metadata'> {
  lineCount?: number;
  lastLine?: number;
  appendPosition?: number;
  isBinary?: boolean;
}

export async function getFileInfo(filePath: string): Promise<LocalFileInfo> {
  const validPath = await validatePath(filePath);
  const stats = await fs.stat(validPath);
  const fallback: FileInfo = {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
    fileType: 'binary',
  };

  let info = fallback;
  try {
    info = await (await getFileHandler(validPath)).getInfo(validPath);
  } catch {
    // Basic stat information remains available if type-specific inspection fails.
  }

  const result: LocalFileInfo = {
    size: info.size ?? fallback.size,
    created: info.created ?? fallback.created,
    modified: info.modified ?? fallback.modified,
    accessed: info.accessed ?? fallback.accessed,
    isDirectory: info.isDirectory ?? fallback.isDirectory,
    isFile: info.isFile ?? fallback.isFile,
    permissions: info.permissions ?? fallback.permissions,
    fileType: info.fileType ?? fallback.fileType,
  };

  if (info.metadata?.lineCount !== undefined) {
    result.lineCount = info.metadata.lineCount;
    result.lastLine = Math.max(0, info.metadata.lineCount - 1);
    result.appendPosition = info.metadata.lineCount;
  }
  if (info.metadata?.isBinary) result.isBinary = true;

  return result;
}

export type { FileResult } from '../utils/files/base.js';
