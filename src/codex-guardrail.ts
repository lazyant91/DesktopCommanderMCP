import path from 'node:path';

export type CodexGuardrailDecision =
  | { matched: false }
  | { matched: true; form: 'direct-executable' | 'official-package-launch' };

export type TerminalSessionKind = 'shell' | 'other';

export const CODEX_GUARDRAIL_MESSAGE = `Local Codex CLI execution was not performed.

Local MCP process calls do not carry trusted origin metadata, so this reminder applies to every matching request and protects the human operator's local Codex subscription quota.

Continue through Inline Execution in the current web ChatGPT session. Do not select a local Codex-backed Subagent and do not work around this refusal.

A separate Codex session started directly by the human operator in a local terminal is outside this Local MCP process-tool guardrail.`;

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
  const trimmed = value.trim();
  const withoutCmdEchoPrefix = trimmed.startsWith('@') ? trimmed.slice(1).trimStart() : trimmed;
  const unquoted = stripMatchingQuotes(withoutCmdEchoPrefix);
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
  let quote: '"' | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"') {
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

function isOfficialCodexPackageSpec(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  if (normalized === CODEX_PACKAGE) return true;
  const versionedPrefix = `${CODEX_PACKAGE}@`;
  return normalized.startsWith(versionedPrefix) && normalized.length > versionedPrefix.length;
}

function isOfficialPackageLaunch(tokens: string[]): boolean {
  if (tokens.length < 2) return false;

  const launcher = normalizedExecutableName(tokens[0]);
  if (launcher === 'npx') {
    let index = 1;
    if (tokens[index] === '-y' || tokens[index] === '--yes') index += 1;
    if (tokens[index] === '--') index += 1;
    return isOfficialCodexPackageSpec(tokens[index]);
  }

  if (launcher === 'npm' && (tokens[1]?.toLowerCase() === 'exec' || tokens[1]?.toLowerCase() === 'x')) {
    let index = 2;
    if (tokens[index] === '--') index += 1;
    return isOfficialCodexPackageSpec(tokens[index]);
  }

  return false;
}

export function detectCodexCliLaunch(command: string): CodexGuardrailDecision {
  for (const segment of splitCommandSegments(command)) {
    const tokens = tokenize(segment);
    const launchTokens = tokens[0] === '@' ? tokens.slice(1) : tokens;
    if (launchTokens.length === 0) continue;

    if (isCodexExecutable(launchTokens[0])) {
      return { matched: true, form: 'direct-executable' };
    }

    if (isOfficialPackageLaunch(launchTokens)) {
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
    for (const arg of args) {
      if (/^\/c$/i.test(arg)) return 'other';
      if (/^\/k$/i.test(arg)) return 'shell';
    }
    return 'shell';
  }

  if (shell === 'powershell' || shell === 'pwsh') {
    let noExit = false;

    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (/^-noexit$/i.test(arg)) {
        noExit = true;
        continue;
      }
      if (/^-(?:command|c|file|f)$/i.test(arg)) {
        if (args[index + 1] === '-') return 'shell';
        return noExit ? 'shell' : 'other';
      }
      if (/^-(?:executionpolicy|workingdirectory|inputformat|outputformat)$/i.test(arg)) {
        if (index + 1 >= args.length) return 'other';
        index += 1;
        continue;
      }
      if (!arg.startsWith('-')) return noExit ? 'shell' : 'other';
    }

    return 'shell';
  }

  if (shell === 'bash' || shell === 'sh' || shell === 'zsh') {
    let stdinMode = false;
    let optionsEnded = false;

    for (const arg of args) {
      if (!optionsEnded) {
        if (arg === '--') {
          optionsEnded = true;
          continue;
        }
        if (arg === '-c' || arg === '--command') return 'other';
        if (arg === '-s') {
          stdinMode = true;
          continue;
        }
        if (arg.startsWith('-')) continue;
      }

      return stdinMode ? 'shell' : 'other';
    }

    return 'shell';
  }

  return 'other';
}
