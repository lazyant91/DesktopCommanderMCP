import { configManager } from '../config-manager.js';
import { createErrorResponse } from '../error-handlers.js';
import type { ServerResult } from '../types.js';
import { detectLineEnding, normalizeLineEndings } from '../utils/lineEndingHandler.js';
import { readFileInternal, writeFile } from './filesystem.js';
import { PublicEditBlockArgsSchema } from './schemas.js';

function countOccurrences(content: string, search: string): number {
  let count = 0;
  let offset = 0;

  while (offset <= content.length - search.length) {
    const matchIndex = content.indexOf(search, offset);
    if (matchIndex === -1) break;
    count += 1;
    offset = matchIndex + search.length;
  }

  return count;
}

function replaceOccurrences(
  content: string,
  search: string,
  replacement: string,
  expectedReplacements: number,
): string {
  if (expectedReplacements === 1) {
    const index = content.indexOf(search);
    return `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`;
  }

  return content.split(search).join(replacement);
}

function createPreview(
  previousContent: string,
  nextContent: string,
  normalizedSearch: string,
  normalizedReplacement: string,
): string {
  const changeIndex = previousContent.indexOf(normalizedSearch);
  const lines = nextContent.split(/\r\n|\n|\r/);
  const changeStartLine = Math.max(
    0,
    previousContent.slice(0, Math.max(0, changeIndex)).split(/\r\n|\n|\r/).length - 1,
  );
  const changedLineCount = Math.max(1, normalizedReplacement.split(/\r\n|\n|\r/).length);
  const contextLines = 10;
  const previewStart = Math.max(0, changeStartLine - contextLines);
  const previewEnd = Math.min(lines.length, changeStartLine + changedLineCount + contextLines);
  const previewLines = lines.slice(previewStart, previewEnd);
  const remaining = Math.max(0, lines.length - previewEnd);
  const startLabel = previewStart === 0 ? 'start' : `line ${previewStart}`;

  return (
    `[Reading ${previewLines.length} lines from ${startLabel} ` +
    `(total: ${lines.length} lines, ${remaining} remaining)]\n\n` +
    previewLines.join('\n')
  );
}

/**
 * Replace an exact text block in a local text file.
 *
 * The public contract is intentionally limited to exact string replacement.
 * Fuzzy matching, document ranges, MCP App metadata, and telemetry are not part
 * of the standalone local MCP.
 */
export async function handleEditBlock(args: unknown): Promise<ServerResult> {
  if (
    args &&
    typeof args === 'object' &&
    'old_string' in args &&
    (args as { old_string?: unknown }).old_string === ''
  ) {
    return createErrorResponse(
      'Empty search strings are not allowed. Please provide a non-empty old_string.',
    );
  }

  const parsed = PublicEditBlockArgsSchema.safeParse(args);
  if (!parsed.success) {
    return createErrorResponse(`Invalid edit arguments: ${parsed.error.message}`);
  }

  const {
    file_path: filePath,
    old_string: oldString,
    new_string: newString,
    expected_replacements: expectedReplacements,
  } = parsed.data;

  try {
    const content = await readFileInternal(filePath, 0, Number.MAX_SAFE_INTEGER);
    const lineEnding = detectLineEnding(content);
    const normalizedSearch = normalizeLineEndings(oldString, lineEnding);
    const normalizedReplacement = normalizeLineEndings(newString, lineEnding);
    const occurrenceCount = countOccurrences(content, normalizedSearch);

    if (occurrenceCount !== expectedReplacements) {
      if (occurrenceCount === 0) {
        return createErrorResponse(`Search content not found in ${filePath}.`);
      }

      return createErrorResponse(
        `Expected ${expectedReplacements} occurrences but found ${occurrenceCount} in ${filePath}. ` +
          `Make old_string more specific or set expected_replacements to ${occurrenceCount}.`,
      );
    }

    const nextContent = replaceOccurrences(
      content,
      normalizedSearch,
      normalizedReplacement,
      expectedReplacements,
    );
    await writeFile(filePath, nextContent, 'rewrite');

    const config = await configManager.getConfig();
    const lineLimit = config.fileWriteLineLimit ?? 50;
    const searchLines = oldString.split(/\r\n|\n|\r/).length;
    const replacementLines = newString.split(/\r\n|\n|\r/).length;
    const editedLines = Math.max(searchLines, replacementLines);
    const warning =
      editedLines > lineLimit
        ? `\n\nWarning: this edit contains ${editedLines} lines; the configured write guidance is ${lineLimit}.`
        : '';
    const preview = createPreview(
      content,
      nextContent,
      normalizedSearch,
      normalizedReplacement,
    );
    const editLabel = expectedReplacements === 1 ? 'edit' : 'edits';

    return {
      content: [
        {
          type: 'text',
          text:
            `Successfully applied ${expectedReplacements} ${editLabel} to ${filePath}.${warning}` +
            `\n\n${preview}`,
        },
      ],
    };
  } catch (error) {
    return createErrorResponse(error instanceof Error ? error.message : String(error));
  }
}
