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

interface ParseResult<T> {
  value?: T;
  error?: string;
}

interface ShellToken {
  value: string;
  quote?: "'" | '"';
}

const POWERSHELL_DELETE = new Set(['remove-item', 'rm', 'ri', 'rd', 'rmdir']);
const POWERSHELL_DIRECTORY_ALIAS = new Set(['rd', 'rmdir']);
const CMD_DELETE = new Set(['rd', 'rmdir']);

function basename(value: string): string {
  return path.win32.basename(path.posix.basename(value.trim())).toLowerCase();
}

export function classifyDirectoryDeleteShell(
  shellPath: string | undefined,
): DirectoryDeleteShell {
  const name = shellPath ? basename(shellPath.replace(/^['"]|['"]$/g, '')) : '';
  if (['powershell', 'powershell.exe', 'pwsh', 'pwsh.exe'].includes(name)) {
    return 'powershell';
  }
  return name === 'cmd' || name === 'cmd.exe' ? 'cmd' : 'other';
}

function hasDeleteKeyword(command: string, shell: DirectoryDeleteShell): boolean {
  const pattern =
    shell === 'powershell'
      ? /(?:^|[\s;&|])(?:remove-item|rm|ri|rd|rmdir)(?=$|[\s;&|])/i
      : /(?:^|[\s&|])@?(?:rd|rmdir)(?=$|[\s&|])/i;
  return pattern.test(command);
}

function splitSegments(
  command: string,
  shell: DirectoryDeleteShell,
): ParseResult<string[]> {
  const segments: string[] = [];
  let current = '';
  let quote: string | undefined;

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (
        shell === 'powershell' &&
        quote === "'" &&
        char === "'" &&
        command[i + 1] === "'"
      ) {
        current += "''";
        i += 1;
      } else {
        if (char === quote) quote = undefined;
        current += char;
      }
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

    const separator =
      char === '\r' ||
      char === '\n' ||
      char === '&' ||
      char === '|' ||
      (shell === 'powershell' && char === ';');
    if (separator) {
      if (current.trim()) segments.push(current.trim());
      current = '';
      if ((char === '&' || char === '|') && command[i + 1] === char) i += 1;
    } else {
      current += char;
    }
  }

  if (quote) {
    return { error: 'The directory deletion command contains an unterminated quote.' };
  }
  if (current.trim()) segments.push(current.trim());
  return { value: segments };
}

function tokenize(segment: string, shell: DirectoryDeleteShell): ParseResult<ShellToken[]> {
  const tokens: ShellToken[] = [];
  let current = '';
  let started = false;
  let quote: "'" | '"' | undefined;
  let hasUnquoted = false;
  const quoteKinds = new Set<"'" | '"'>();

  const flush = () => {
    if (!started) return;
    const tokenQuote =
      !hasUnquoted && quoteKinds.size === 1
        ? quoteKinds.values().next().value
        : undefined;
    tokens.push({ value: current, quote: tokenQuote });
    current = '';
    started = false;
    hasUnquoted = false;
    quoteKinds.clear();
  };

  for (let i = 0; i < segment.length; i += 1) {
    const char = segment[i];
    if (quote) {
      if (
        shell === 'powershell' &&
        quote === "'" &&
        char === "'" &&
        segment[i + 1] === "'"
      ) {
        current += "'";
        i += 1;
      } else if (char === quote) {
        quote = undefined;
      } else {
        if ((shell === 'powershell' && char === '`') || (shell === 'cmd' && char === '^')) {
          return {
            error: `Shell escape character ${char} is not supported in directory deletion commands.`,
          };
        }
        current += char;
      }
      started = true;
      continue;
    }

    if (
      (shell === 'powershell' && (char === '"' || char === "'")) ||
      (shell === 'cmd' && char === '"')
    ) {
      quote = char;
      quoteKinds.add(char);
      started = true;
    } else if (
      (shell === 'powershell' && char === '`') ||
      (shell === 'cmd' && char === '^')
    ) {
      return {
        error: `Shell escape character ${char} is not supported in directory deletion commands.`,
      };
    } else if (/\s/.test(char)) {
      flush();
    } else {
      current += char;
      started = true;
      hasUnquoted = true;
    }
  }

  if (quote) {
    return { error: 'The directory deletion command contains an unterminated quote.' };
  }
  flush();
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

function rootTarget(target: string, cwd: string): { root: boolean; resolved: string } {
  const input = target.trim().split('/').join('\\');
  const resolved = path.win32.resolve(cwd.split('/').join('\\'), input);
  const directRoot = /^[a-z]:(?:[\\.]?)$/i.test(input);
  const driveWildcard = /^[a-z]:\\(?:\*|\*\.\*)\\?$/i.test(input);
  const uncRoot = /^\\\\[^\\]+\\[^\\]+\\?(?:\*|\*\.\*)?$/i.test(input);
  const extendedUncRoot =
    /^\\\\[?.]\\UNC\\[^\\]+\\[^\\]+\\?(?:\*|\*\.\*)?$/i.test(input);
  const normalized = path.win32.normalize(resolved);
  const parsedRoot = path.win32.normalize(path.win32.parse(normalized).root);
  return {
    root:
      directRoot ||
      driveWildcard ||
      uncRoot ||
      extendedUncRoot ||
      normalized.toLowerCase() === parsedRoot.toLowerCase(),
    resolved,
  };
}

function validateTarget(
  targetToken: ShellToken,
  shell: DirectoryDeleteShell,
  cwd: string,
): DirectoryDeleteValidation | undefined {
  const target = targetToken.value;
  const fullyQuoted = targetToken.quote !== undefined;
  const singleQuoted = targetToken.quote === "'";
  const dynamic =
    !target ||
    (shell === 'powershell'
      ? (!singleQuoted && target.includes('$')) ||
        (!fullyQuoted && (target.startsWith('@(') || target.includes(',')))
      : target.includes('%') || target.includes('!'));
  if (dynamic) {
    return blocked(
      shell,
      'dynamic-target',
      'Use one explicit literal directory path so the deletion target can be checked before execution.',
      target,
    );
  }

  const resolved = rootTarget(target, cwd);
  return resolved.root
    ? blocked(
        shell,
        'filesystem-root',
        'Deleting a filesystem root is never allowed.',
        target,
        resolved.resolved,
      )
    : undefined;
}

function validatePowerShell(
  segment: string,
  cwd: string,
): DirectoryDeleteValidation | undefined {
  const parsed = tokenize(segment, 'powershell');
  if (parsed.error) return blocked('powershell', 'invalid-syntax', parsed.error);
  const tokens = parsed.value ?? [];
  const command = basename(tokens[0]?.value ?? '');
  if (!POWERSHELL_DELETE.has(command)) return undefined;

  const targets: ShellToken[] = [];
  let recursive = false;
  const flags = new Set([
    '-force',
    '-fo',
    '-whatif',
    '-confirm',
    '-confirm:$true',
    '-confirm:$false',
  ]);
  const valueOptions = new Set(['-erroraction', '-ea']);
  const pathOptions = new Set(['-path', '-literalpath']);

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    const value = token.value;
    const lower = value.toLowerCase();
    if (lower === '-recurse' || lower === '-r') {
      recursive = true;
    } else if (flags.has(lower)) {
      continue;
    } else if (valueOptions.has(lower)) {
      const next = tokens[i + 1];
      if (!next || next.value.startsWith('-')) {
        return blocked('powershell', 'invalid-syntax', `${value} requires a value.`);
      }
      i += 1;
    } else if (pathOptions.has(lower)) {
      const next = tokens[i + 1];
      if (!next || next.value.startsWith('-')) {
        return blocked(
          'powershell',
          'invalid-syntax',
          `${value} requires a directory path.`,
        );
      }
      targets.push(next);
      i += 1;
    } else if (value.startsWith('-')) {
      return blocked(
        'powershell',
        'invalid-syntax',
        `Unsupported PowerShell deletion option: ${value}.`,
      );
    } else {
      targets.push(token);
    }
  }

  if (targets.length === 0) {
    return blocked(
      'powershell',
      'invalid-syntax',
      'The directory deletion command is missing its target path.',
    );
  }

  const roots = targets.map((target) => rootTarget(target.value, cwd));
  if (
    !recursive &&
    !POWERSHELL_DIRECTORY_ALIAS.has(command) &&
    !roots.some((item) => item.root)
  ) {
    return undefined;
  }
  for (const target of targets) {
    const failure = validateTarget(target, 'powershell', cwd);
    if (failure) return failure;
  }
  return { detected: true, allowed: true, shell: 'powershell' };
}

function validateCmd(segment: string, cwd: string): DirectoryDeleteValidation | undefined {
  const parsed = tokenize(segment, 'cmd');
  if (parsed.error) return blocked('cmd', 'invalid-syntax', parsed.error);
  const tokens = parsed.value ?? [];

  let commandIndex = 0;
  let commandToken = tokens[0]?.value ?? '';
  if (commandToken === '@') {
    commandIndex = 1;
    commandToken = tokens[commandIndex]?.value ?? '';
  } else if (commandToken.startsWith('@')) {
    commandToken = commandToken.slice(1);
  }
  if (!CMD_DELETE.has(basename(commandToken))) return undefined;

  const targets: ShellToken[] = [];
  for (const token of tokens.slice(commandIndex + 1)) {
    const value = token.value;
    const lower = value.toLowerCase();
    if (lower === '/s' || lower === '/q') continue;
    if (value.startsWith('/')) {
      return blocked('cmd', 'invalid-syntax', `Unsupported CMD deletion option: ${value}.`);
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

  return validateTarget(targets[0], 'cmd', cwd) ?? {
    detected: true,
    allowed: true,
    shell: 'cmd',
  };
}

export function validateDirectoryDeleteCommand(
  command: string,
  shellPath: string | undefined,
  cwd = process.cwd(),
): DirectoryDeleteValidation {
  const shell = classifyDirectoryDeleteShell(shellPath);
  if (shell === 'other') return { detected: false, allowed: true, shell };

  const segments = splitSegments(command, shell);
  if (segments.error) {
    return hasDeleteKeyword(command, shell)
      ? blocked(shell, 'invalid-syntax', segments.error)
      : { detected: false, allowed: true, shell };
  }

  let detected = false;
  for (const segment of segments.value ?? []) {
    const result =
      shell === 'powershell' ? validatePowerShell(segment, cwd) : validateCmd(segment, cwd);
    if (!result) continue;
    detected = true;
    if (!result.allowed) return result;
  }
  return detected
    ? { detected: true, allowed: true, shell }
    : { detected: false, allowed: true, shell };
}

export function formatDirectoryDeleteGuardError(
  result: DirectoryDeleteValidation,
): string {
  const shell =
    result.shell === 'powershell' ? 'PowerShell' : result.shell === 'cmd' ? 'CMD' : 'Unknown';
  const lines = [
    result.reason === 'filesystem-root'
      ? 'Catastrophic directory deletion blocked.'
      : 'Directory deletion command blocked.',
    '',
    `Shell: ${shell}`,
  ];
  if (result.target !== undefined) lines.push(`Target: ${result.target || '(empty)'}`);
  if (result.resolvedTarget) lines.push(`Resolved target: ${result.resolvedTarget}`);
  if (result.detail) lines.push(`Reason: ${result.detail}`);
  lines.push('', 'No command was executed.');
  return lines.join('\n');
}
