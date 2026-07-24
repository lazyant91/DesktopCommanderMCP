import path from 'node:path';

export type CodexGuardrailDecision =
  | { matched: false }
  | { matched: true; form: 'direct-executable' | 'official-package-launch' };

export type TerminalSessionKind = 'shell' | 'other';

export const CODEX_GUARDRAIL_MESSAGE = `Local Codex CLI execution was not performed.

This task originated from web ChatGPT, Remote, or Local MCP and must not use or consume the human operator's local Codex subscription quota.

Continue through Inline Execution in the current web ChatGPT session. Do not select a local Codex-backed Subagent and do not work around this refusal.

A separate Codex session started directly by the human operator is outside this Remote-only restriction.`;

const CODEX_PACKAGE = '@openai/codex';
const LAUNCHER_SUFFIXES = /\.(?:exe|cmd|bat|ps1)$/i;

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function portableBasename(value: string): string {
  const unquoted = stripMatchingQuotes(value);
  return path.win32.basename(path.posix.basename(unquoted));
}

function normalizedExecutableName(value: string): string {
  return portableBasename(value).replace(LAUNCHER_SUFFIXES, '').toLowerCase();
}

export function isCodexExecutable(value: string): boolean {
  return normalizedExecutableName(value) === 'codex';
}

function splitCommandSegments(command: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && quote !== "'") {
      current += char;
      escaped = true;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === '\r' || char === '\n') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      if (char === '\r' && command[index + 1] === '\n') index += 1;
      continue;
    }

    if (char === ';' || char === '|' || char === '&') {
      if (current.trim()) segments.push(current.trim());
      current = '';
      if (command[index + 1] === char) index += 1;
      continue;
    }

    current += char;
  }

  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  const pushCurrent = () => {
    if (current.length > 0) {
      tokens.push(current);
      current = '';
    }
  };

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (char === '\\' && quote === '"') {
      const next = command[index + 1];
      if (next === '"' || next === '\\') {
        current += next;
        index += 1;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '\\') {
      current += char;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

    current += char;
  }

  pushCurrent();
  return tokens;
}

function isOfficialPackageLaunch(tokens: string[]): boolean {
  if (tokens.length < 2) return false;

  const launcher = normalizedExecutableName(tokens[0]);
  if (launcher === 'npx') {
    let index = 1;
    if (tokens[index] === '-y' || tokens[index] === '--yes') index += 1;
    return tokens[index]?.toLowerCase() === CODEX_PACKAGE;
  }

  if (launcher === 'npm' && (tokens[1]?.toLowerCase() === 'exec' || tokens[1]?.toLowerCase() === 'x')) {
    let index = 2;
    if (tokens[index] === '--') index += 1;
    return tokens[index]?.toLowerCase() === CODEX_PACKAGE;
  }

  return false;
}

export function detectCodexCliLaunch(command: string): CodexGuardrailDecision {
  for (const segment of splitCommandSegments(command)) {
    const tokens = tokenize(segment);
    if (tokens.length === 0) continue;

    if (isCodexExecutable(tokens[0])) {
      return { matched: true, form: 'direct-executable' };
    }

    if (isOfficialPackageLaunch(tokens)) {
      return { matched: true, form: 'official-package-launch' };
    }
  }

  return { matched: false };
}

export function classifyTerminalSession(command: string): TerminalSessionKind {
  const tokens = tokenize(command.trim());
  if (tokens.length === 0) return 'other';

  const shell = normalizedExecutableName(tokens[0]);
  const args = tokens.slice(1);

  if (shell === 'cmd') {
    if (args.some((arg) => /^\/c$/i.test(arg))) return 'other';
    if (args.some((arg) => /^\/k$/i.test(arg))) return 'shell';
    return 'shell';
  }

  if (shell === 'powershell' || shell === 'pwsh') {
    if (args.some((arg) => /^-noexit$/i.test(arg))) return 'shell';

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (/^-(?:command|c|file|f)$/i.test(arg)) return 'other';
      if (/^-(?:executionpolicy|workingdirectory|inputformat|outputformat)$/i.test(arg)) {
        if (index + 1 >= args.length) return 'other';
        index += 1;
        continue;
      }
      if (!arg.startsWith('-')) return 'other';
    }

    return 'shell';
  }

  if (shell === 'bash' || shell === 'sh' || shell === 'zsh') {
    if (args.some((arg) => arg === '-c' || arg === '--command')) return 'other';
    return args.some((arg) => !arg.startsWith('-')) ? 'other' : 'shell';
  }

  return 'other';
}
