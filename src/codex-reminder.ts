import path from 'node:path';

export const CODEX_REMINDER_MESSAGE = `Local Codex CLI execution was not performed.

This Local MCP reminder is a thin accidental-use stop line for obvious direct Codex launches. It is not a complete block or security boundary.

Continue through Inline Execution in the current web ChatGPT session. Do not select a local Codex-backed Subagent and do not work around this reminder.

A separate Codex session started directly by the human operator in a local terminal is outside this Local MCP process-tool reminder.`;

const CODEX_PACKAGE = '@openai/codex';
const SUPPORTED_SUFFIX = /\.(?:exe|cmd|ps1)$/i;

type LeadingToken = { value: string; next: number };

function readToken(command: string, offset: number): LeadingToken | undefined {
  let index = offset;
  while (index < command.length && /\s/.test(command[index])) index += 1;
  if (index >= command.length) return undefined;

  const quote = command[index] === '"' || command[index] === "'" ? command[index] : undefined;
  if (quote) {
    const start = index + 1;
    const end = command.indexOf(quote, start);
    if (end === -1) return { value: command.slice(start), next: command.length };
    return { value: command.slice(start, end), next: end + 1 };
  }

  const start = index;
  while (index < command.length && !/\s/.test(command[index])) index += 1;
  return { value: command.slice(start, index), next: index };
}

function leadingTokens(command: string, limit: number): string[] {
  const tokens: string[] = [];
  let offset = 0;
  while (tokens.length < limit) {
    const token = readToken(command, offset);
    if (!token) break;
    tokens.push(token.value);
    offset = token.next;
  }
  return tokens;
}

function portableBasename(value: string): string {
  const trimmed = value.trim();
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1)
      : trimmed;
  return path.win32.basename(path.posix.basename(unquoted));
}

function normalizedExecutable(value: string): string {
  return portableBasename(value).replace(SUPPORTED_SUFFIX, '').toLowerCase();
}

export function isCodexExecutable(value: string | undefined): boolean {
  return typeof value === 'string' && normalizedExecutable(value) === 'codex';
}

export function isObviousCodexLaunch(command: string): boolean {
  const tokens = leadingTokens(command, 4);
  if (tokens.length === 0) return false;
  if (isCodexExecutable(tokens[0])) return true;

  const launcher = normalizedExecutable(tokens[0]);
  if (launcher === 'npx') {
    const packageIndex = tokens[1] === '-y' || tokens[1] === '--yes' ? 2 : 1;
    return tokens[packageIndex]?.toLowerCase() === CODEX_PACKAGE;
  }

  return (
    launcher === 'npm' &&
    (tokens[1]?.toLowerCase() === 'exec' || tokens[1]?.toLowerCase() === 'x') &&
    tokens[2] === '--' &&
    tokens[3]?.toLowerCase() === CODEX_PACKAGE
  );
}
