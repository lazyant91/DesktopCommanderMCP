import os from 'node:os';
import path from 'node:path';

import { configManager } from '../config-manager.js';
import { createErrorResponse } from '../error-handlers.js';
import {
  createDirectory,
  getFileInfo,
  listDirectory,
  moveFile,
  readFile,
  writeFile,
} from '../tools/filesystem.js';
import {
  CreateDirectoryArgsSchema,
  GetFileInfoArgsSchema,
  ListDirectoryArgsSchema,
  MoveFileArgsSchema,
  ReadFileArgsSchema,
  ReadMultipleFilesArgsSchema,
  WriteFileArgsSchema,
} from '../tools/schemas.js';
import type { ServerResult } from '../types.js';

function expandHome(filePath: string): string {
  if (filePath === '~' || filePath.startsWith('~/') || filePath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

export function resolveAbsolutePath(filePath: string): string {
  const expanded = expandHome(filePath);
  return path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(process.cwd(), expanded);
}

function asText(content: string | Buffer): string {
  return typeof content === 'string' ? content : content.toString('utf8');
}

export async function handleReadFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = ReadFileArgsSchema.parse(args);
    const config = await configManager.getConfig();
    const length = parsed.length ?? config.fileReadLineLimit ?? 1000;
    const result = await readFile(parsed.path, {
      offset: parsed.offset,
      length,
    });

    return {
      content: [{ type: 'text', text: asText(result.content) }],
    };
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

export async function handleReadMultipleFiles(args: unknown): Promise<ServerResult> {
  try {
    const parsed = ReadMultipleFilesArgsSchema.parse(args);
    const config = await configManager.getConfig();
    const length = config.fileReadLineLimit ?? 1000;
    const sections: string[] = [];

    for (const filePath of parsed.paths) {
      try {
        const result = await readFile(filePath, { offset: 0, length });
        sections.push(`--- ${filePath} ---\n${asText(result.content)}`);
      } catch (error) {
        sections.push(
          `--- ${filePath} ---\nError: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      content: [{ type: 'text', text: sections.join('\n\n') }],
    };
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

export async function handleWriteFile(args: unknown): Promise<ServerResult> {
  try {
    const modeProvided = Boolean(args && typeof args === 'object' && 'mode' in args);
    const parsed = WriteFileArgsSchema.parse(args);

    if (!modeProvided) {
      try {
        const existing = await getFileInfo(parsed.path);
        if (existing.isFile && existing.size > 0) {
          return createErrorResponse(
            `Write rejected to prevent accidental data loss: ${parsed.path} already contains ` +
              `${existing.size} bytes. Retry with mode 'append' or 'rewrite'.`,
          );
        }
      } catch {
        // A missing target is safe to create; the write reports real path errors.
      }
    }

    const config = await configManager.getConfig();
    const lineLimit = config.fileWriteLineLimit ?? 50;
    const lineCount = parsed.content.split('\n').length;

    await writeFile(parsed.path, parsed.content, parsed.mode);

    const limitNote =
      lineCount > lineLimit
        ? ` The configured write limit is ${lineLimit} lines; this call contained ${lineCount}.`
        : '';
    const action = parsed.mode === 'append' ? 'Appended to' : 'Wrote';

    return {
      content: [{ type: 'text', text: `${action} ${parsed.path}.${limitNote}` }],
    };
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

export async function handleCreateDirectory(args: unknown): Promise<ServerResult> {
  try {
    const parsed = CreateDirectoryArgsSchema.parse(args);
    await createDirectory(parsed.path);
    return {
      content: [{ type: 'text', text: `Created directory ${parsed.path}.` }],
    };
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

export async function handleListDirectory(args: unknown): Promise<ServerResult> {
  try {
    const parsed = ListDirectoryArgsSchema.parse(args);
    const entries = await listDirectory(parsed.path, parsed.depth);
    return {
      content: [{ type: 'text', text: entries.join('\n') }],
    };
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

export async function handleMoveFile(args: unknown): Promise<ServerResult> {
  try {
    const parsed = MoveFileArgsSchema.parse(args);
    await moveFile(parsed.source, parsed.destination);
    return {
      content: [
        {
          type: 'text',
          text: `Moved ${parsed.source} to ${parsed.destination}.`,
        },
      ],
    };
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function handleGetFileInfo(args: unknown): Promise<ServerResult> {
  try {
    const parsed = GetFileInfoArgsSchema.parse(args);
    const info = await getFileInfo(parsed.path);
    const text = Object.entries(info)
      .map(([key, value]) => `${key}: ${formatValue(value)}`)
      .join('\n');

    return {
      content: [{ type: 'text', text }],
    };
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}
