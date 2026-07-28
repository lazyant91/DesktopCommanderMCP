import path from 'node:path';

export type DirectoryDeleteShell = 'powershell' | 'cmd' | 'other';
export type DirectoryDeleteBlockReason =
  | 'invalid-syntax'
  | 'dynamic-target'
  | 'filesystem-root';

export interface DirectoryDeleteValidation {
  detected: boolean;
  allowed: boolean;
  shell: DirectoryDeleteShell;
  reason?: DirectoryDeleteBlockReason;
  target?: string;
  resolvedTarget?: string;
  detail?: string;
}

interface Token {
  value: string;
  quoted: boolean;
}

interface ParseResult<T> {
  value?: T;
  error?: string;
}

const POWERSHELL_DELETE_COMMANDS = new Set([
  'remove-item',
  'rm',
  'ri',
  'rd',
  'rmdir',
]);
const POWERSHELL_DIRECTORY_ALIASES = new Set(['rd', 'rmdir']);
const CMD_DELETE_COMMANDS = new Set(['rd', 'rmdir']);

function portableBasename(value: string): string {
  const trimmed = value.trim();
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1)
      : trimmed;
  return path.win32.basename(path.posix.basename(unquoted)).toLowerCase();
}

export function classifyDirectoryDeleteShell(
  shellPath: string | undefined,
): DirectoryDeleteShell {
  if (!shellPath) return 'other';
  const name = portableBasename(shellPath);
  if (
    name === 'powershell' ||
    name === 'powershell.exe' ||
    name === 'pwsh' ||
    name === 'pwsh.exe'
  ) {
    return 'powershell';
  }
  if (name === 'cmd' || name === 'cmd.exe') return 'cmd';
  return 'other';
}

function containsDeleteKeyword(command: string, shell: DirectoryDeleteShell): boolean {
  if (shell === 'powershell') {
    return /(?:^|[\s;&|])(?:remove-item|rm|ri|rd|rmdir)(?=$|[\s;&|])/i.test(command);
  }
  if (shell === 'cmd') {
    return /(?:^|[\s&|])(?:rd|rmdir)(?=$|[\s&|])/i.test(command);
  }
  return false;
}

function splitCommandSegments(
  command: string,
  shell: DirectoryDeleteShell,
): ParseResult<string[]> {
  const segments: string[] = [];
  let current = '';
  let quote: string | undefined;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (quote) {
      if (
        shell === 'powershell' &&
        quote === "'" &&
        char === "'" &&
        command[index + 1] === "'"
      ) {
        current += "''";
        index += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      current += char;
      continue;
    }

    if (
      (shell === 'powershell' && (char === '"' || char === "'")) ||
      (shell === 'cmd' && char === '"')
    ) {
      quote = char;
      current += char;
      continue;
    }

    if ((shell === 'powershell' && char === '`') || (shell === 'cmd' && char === '^')) {
      return {
        error: `Shell escape character ${char} is not supported in directory deletion commands.`,
      };
    }

    const isNewline = char === '\n' || char === '\r';
    const isPowerShellSemicolon = shell === 'powershell' && char === ';';
    const isOperator = char === '&' || char === '|';
    if (isNewline || isPowerShellSemicolon || isOperator) {
      if (current.trim()) segments.push(current.trim());
      current = '';
      if (isOperator && command[index + 1] === char) index += 1;
      continue;
    }

    current += char;
  }

  if (quote) {
    return { error: 'The directory deletion command contains an unterminated quote.' };
  }
  if (current.trim()) segments.push(current.trim());
  return { value: segments };
}

function tokenize(segment: string, shell: DirectoryDeleteShell): ParseResult<Token[]> {
  const tokens: Token[] = [];
  let current = '';
  let tokenStarted = false;
  let tokenQuoted = false;
  let quote: string | undefined;

  const pushToken = () => {
    if (!tokenStarted) return;
    tokens.push({ value: current, quoted: tokenQuoted });
    current = '';
    tokenStarted = false;
    tokenQuoted = false;
  };

  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];

    if (quote) {
      if (
        shell === 'powershell' &&
        quote === "'" &&
        char === "'" &&
        segment[index + 1] === "'"
      ) {
        current += "'";
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = undefined;
        tokenStarted = true;
        tokenQuoted = true;
        continue;
      }
      if ((shell === 'powershell' && char === '`') || (shell === 'cmd' && char === '^')) {
        return {
          error: `Shell escape character ${char} is not supported in directory deletion commands.`,
        };
      }
      current += char;
      tokenStarted = true;
      continue;
    }

    if (
      (shell === 'powershell' && (char === '"' || char === "'")) ||
      (shell === 'cmd' && char === '"')
    ) {
      quote = char;
      tokenStarted = true;
      tokenQuoted = true;
      continue;
    }

    if ((shell === 'powershell' && char === '`') || (shell === 'cmd' && char === '^')) {
      return {
        error: `Shell escape character ${char} is not supported in directory deletion commands.`,
      };
    }

    if (/\s/.test(char)) {
      pushToken();
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (quote) {
    return { error: 'The directory deletion command contains an unterminated quote.' };
  }
  pushToken();
  return { value: tokens };
}

function blocked(
  shell: DirectoryDeleteShell,
  reason: DirectoryDeleteBlockReason,
  detail: string,
  target?: string,
  resolvedTarget?: string,
): DirectoryDeleteValidation {
  return { detected: true, allowed: false, shell, reason, detail, target, resolvedTarget };
}

function allowed(shell: DirectoryDeleteShell): DirectoryDeleteValidation {
  return { detected: true, allowed: true, shell };
}

function isDynamicPowerShellTarget(token: Token): boolean {
  if (!token.value) return true;
  if (
    token.value.startsWith('$') ||
    token.value.startsWith('@(') ||
    token.value.includes('$(')
  ) {
    return true;
  }
  return !token.quoted && token.value.includes(',');
}

function isDynamicCmdTarget(token: Token): boolean {
  return !token.value || token.value.includes('%') || token.value.includes('!');
}

function resolveWindowsTarget(target: string, cwd: string): string {
  return path.win32.resolve(cwd.split('/').join('\\'), target.split('/').join('\\'));
}

function isFilesystemRootTarget(target: string, resolvedTarget: string): boolean {
  const normalizedInput = target.trim().split('/').join('\\');
  if (/^[a-z]:[\\.]?$/i.test(normalizedInput)) return true;
  if (/^[a-z]:\\(?:\*|\*\.\*)\\?$/i.test(normalizedInput)) return true;
  if (/^\\\\[^\\]+\\[^\\]+\\?(?:\*|\*\.\*)?$/i.test(normalizedInput)) return true;

  const normalizedResolved = path.win32.normalize(resolvedTarget);
  const root = path.win32.parse(normalizedResolved).root;
  return normalizedResolved.toLowerCase() === path.win32.normalize(root).toLowerCase();
}

function validateStaticTarget(
  token: Token,
  shell: DirectoryDeleteShell,
  cwd: string,
): DirectoryDeleteValidation | undefined {
  const dynamic =
    shell === 'powershell' ? isDynamicPowerShellTarget(token) : isDynamicCmdTarget(token);
  if (dynamic) {
    return blocked(
      shell,
      'dynamic-target',
      'Use one explicit literal directory path so the deletion target can be checked before execution.',
      token.value,
    );
  }

  const resolvedTarget = resolveWindowsTarget(token.value, cwd);
  if (isFilesystemRootTarget(token.value, resolvedTarget)) {
    return blocked(
      shell,
      'filesystem-root',
      'Deleting a filesystem root is never allowed.',
      token.value,
      resolvedTarget,
    );
  }

  return undefined;
}

function validatePowerShellSegment(
  segment: string,
  cwd: string,
): DirectoryDeleteValidation | undefined {
  const parsed = tokenize(segment, 'powershell');
  if (parsed.error) {
    return blocked('powershell', 'invalid-syntax', parsed.error);
  }

  const tokens = parsed.value ?? [];
  if (tokens.length === 0) return undefined;
  const command = portableBasename(tokens[0].value);
  if (!POWERSHELL_DELETE_COMMANDS.has(command)) return undefined;

  const targets: Token[] = [];
  let recursive = false;

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.value.toLowerCase();

    if (lower === '-recurse' || lower === '-r') {
      recursive = true;
      continue;
    }
    if (
      lower === '-force' ||
      lower === '-fo' ||
      lower === '-whatif' ||
      lower === '-confirm' ||
      lower === '-confirm:$true' ||
      lower === '-confirm:$false'
    ) {
      continue;
    }
    if (lower === '-erroraction' || lower === '-ea') {
      if (!tokens[index + 1] || tokens[index + 1].value.startsWith('-')) {
        return blocked('powershell', 'invalid-syntax', `${token.value} requires a value.`);
      }
      index += 1;
      continue;
    }
    if (lower === '-path' || lower === '-literalpath') {
      const target = tokens[index + 1];
      if (!target || target.value.startsWith('-')) {
        return blocked(
          'powershell',
          'invalid-syntax',
          `${token.value} requires a directory path.`,
        );
      }
      targets.push(target);
      index += 1;
      continue;
    }
    if (token.value.startsWith('-')) {
      return blocked(
        'powershell',
        'invalid-syntax',
        `Unsupported PowerShell deletion option: ${token.value}.`,
      );
    }

    targets.push(token);
  }

  if (targets.length === 0) {
    return blocked(
      'powershell',
      'invalid-syntax',
      'The directory deletion command is missing its target path.',
    );
  }

  const directoryIntent = POWERSHELL_DIRECTORY_ALIASES.has(command) || recursive;
  const targetResults = targets.map((target) => ({
    target,
    resolved: resolveWindowsTarget(target.value, cwd),
  }));
  const hasRootTarget = targetResults.some(({ target, resolved }) =>
    isFilesystemRootTarget(target.value, resolved),
  );

  if (!directoryIntent && !hasRootTarget) return undefined;

  for (const target of targets) {
    const result = validateStaticTarget(target, 'powershell', cwd);
    if (result) return result;
  }

  return allowed('powershell');
}

function validateCmdSegment(
  segment: string,
  cwd: string,
): DirectoryDeleteValidation | undefined {
  const parsed = tokenize(segment, 'cmd');
  if (parsed.error) return blocked('cmd', 'invalid-syntax', parsed.error);

  const tokens = parsed.value ?? [];
  if (tokens.length === 0) return undefined;
  const command = portableBasename(tokens[0].value);
  if (!CMD_DELETE_COMMANDS.has(command)) return undefined;

  const targets: Token[] = [];
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.value.toLowerCase();
    if (lower === '/s' || lower === '/q') continue;
    if (token.value.startsWith('/')) {
      return blocked(
        'cmd',
        'invalid-syntax',
        `Unsupported CMD deletion option: ${token.value}.`,
      );
    }
    targets.push(token);
  }

  if (targets.length !== 1) {
    return blocked(
      'cmd',
      'invalid-syntax',
      targets.length === 0
        ? 'The directory deletion command is missing its target path.'
        : 'CMD rd/rmdir accepts exactly one directory target.',
    );
  }

  const targetResult = validateStaticTarget(targets[0], 'cmd', cwd);
  if (targetResult) return targetResult;
  return allowed('cmd');
}

export function validateDirectoryDeleteCommand(
  command: string,
  shellPath: string | undefined,
  cwd = process.cwd(),
): DirectoryDeleteValidation {
  const shell = classifyDirectoryDeleteShell(shellPath);
  if (shell === 'other') return { detected: false, allowed: true, shell };

  const split = splitCommandSegments(command, shell);
  if (split.error) {
    return containsDeleteKeyword(command, shell)
      ? blocked(shell, 'invalid-syntax', split.error)
      : { detected: false, allowed: true, shell };
  }

  let detected = false;
  for (const segment of split.value ?? []) {
    const result =
      shell === 'powershell'
        ? validatePowerShellSegment(segment, cwd)
        : validateCmdSegment(segment, cwd);
    if (!result) continue;
    detected = true;
    if (!result.allowed) return result;
  }

  return detected ? allowed(shell) : { detected: false, allowed: true, shell };
}

export function formatDirectoryDeleteGuardError(
  result: DirectoryDeleteValidation,
): string {
  const shellName =
    result.shell === 'powershell' ? 'PowerShell' : result.shell === 'cmd' ? 'CMD' : 'Unknown';
  const lines = [
    result.reason === 'filesystem-root'
      ? 'Catastrophic directory deletion blocked.'
      : 'Directory deletion command blocked.',
    '',
    `Shell: ${shellName}`,
  ];
  if (result.target !== undefined) lines.push(`Target: ${result.target || '(empty)'}`);
  if (result.resolvedTarget) lines.push(`Resolved target: ${result.resolvedTarget}`);
  if (result.detail) lines.push(`Reason: ${result.detail}`);
  lines.push('', 'No command was executed.');
  return lines.join('\n');
}
