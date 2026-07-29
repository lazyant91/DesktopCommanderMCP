import path from 'node:path';

export type DirectoryDeleteShell = 'powershell' | 'cmd' | 'other';
export type DirectoryDeleteBlockReason =
  | 'invalid-syntax'
  | 'dynamic-target'
  | 'ambiguous-target'
  | 'filesystem-root'
  | 'unsupported-context';

export interface DirectoryDeleteValidationOptions {
  requireFullyQualifiedTarget?: boolean;
}

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

interface TargetCandidate {
  token: ShellToken;
  literalPath: boolean;
}

const POWERSHELL_DELETE = new Set([
  'remove-item',
  'del',
  'erase',
  'rm',
  'ri',
  'rd',
  'rmdir',
]);
const POWERSHELL_DIRECTORY_ALIAS = new Set(['rd', 'rmdir']);
const CMD_DELETE = new Set(['rd', 'rmdir']);
const POWERSHELL_OUTPUT = new Set(['echo', 'write-host', 'write-output']);
const CMD_OUTPUT = new Set(['echo']);
const POWERSHELL_CONTROL = new Set([
  'catch',
  'do',
  'else',
  'elseif',
  'finally',
  'for',
  'foreach',
  'if',
  'switch',
  'trap',
  'try',
  'while',
]);
const CMD_CONTROL = new Set(['for', 'if']);
const POWERSHELL_INTERPRETERS = new Set([
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
]);
const CMD_INTERPRETERS = new Set(['cmd', 'cmd.exe']);
const UNSUPPORTED_CONTEXT_DETAIL =
  'Directory deletion inside compound or nested shell syntax is not allowed. Use one direct literal-path deletion command in the active shell.';

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

function hasDeleteKeyword(command: string, _shell: DirectoryDeleteShell): boolean {
  const commands = 'remove-item|erase|rmdir|del|rm|ri|rd';
  const pattern = new RegExp(
    `(?:^|[^a-z0-9_.-])(?:${commands})(?=$|[^a-z0-9_.-])`,
    'i',
  );
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

function normalizedCommandName(
  token: ShellToken | undefined,
  shell: DirectoryDeleteShell,
): string {
  let value = token?.value.trim() ?? '';
  if (shell === 'cmd' && value.startsWith('@')) value = value.slice(1);
  value = value.replace(/^[({]+/, '').replace(/[)}]+$/, '');
  return basename(value);
}

function firstCommandIndex(tokens: ShellToken[], shell: DirectoryDeleteShell): number {
  return shell === 'cmd' && tokens[0]?.value === '@' ? 1 : 0;
}

function isOutputOnlySegment(tokens: ShellToken[], shell: DirectoryDeleteShell): boolean {
  const command = normalizedCommandName(tokens[firstCommandIndex(tokens, shell)], shell);
  return shell === 'powershell'
    ? POWERSHELL_OUTPUT.has(command)
    : shell === 'cmd' && CMD_OUTPUT.has(command);
}

function commandCandidateIndexes(
  tokens: ShellToken[],
  shell: DirectoryDeleteShell,
): number[] {
  const first = firstCommandIndex(tokens, shell);
  if (!tokens[first]) return [];

  const command = normalizedCommandName(tokens[first], shell);
  const control =
    shell === 'powershell'
      ? POWERSHELL_CONTROL.has(command)
      : shell === 'cmd' && CMD_CONTROL.has(command);
  const grouped = tokens.some((token) => {
    if (token.quote) return false;
    return shell === 'powershell'
      ? token.value.includes('{') || token.value.includes('}')
      : shell === 'cmd' && (token.value.includes('(') || token.value.includes(')'));
  });
  if (!control && !grouped) return [first];

  const indexes = [first];
  for (let i = first + 1; i < tokens.length; i += 1) {
    if (!tokens[i].quote) indexes.push(i);
  }
  return indexes;
}

function isDirectoryDeleteCommandAt(
  tokens: ShellToken[],
  index: number,
  shell: DirectoryDeleteShell,
): boolean {
  const command = normalizedCommandName(tokens[index], shell);
  if (shell === 'cmd') return CMD_DELETE.has(command);
  if (shell !== 'powershell' || !POWERSHELL_DELETE.has(command)) return false;
  if (POWERSHELL_DIRECTORY_ALIAS.has(command)) return true;
  return tokens.slice(index + 1).some((token) => {
    if (token.quote) return false;
    const value = token.value.toLowerCase();
    return value === '-recurse' || value === '-r';
  });
}

function hasUnquotedDirectoryDeleteIntent(
  tokens: ShellToken[],
  shell: DirectoryDeleteShell,
): boolean {
  return commandCandidateIndexes(tokens, shell).some((index) =>
    isDirectoryDeleteCommandAt(tokens, index, shell),
  );
}

function nestedInterpreterShell(command: string): DirectoryDeleteShell | undefined {
  if (CMD_INTERPRETERS.has(command)) return 'cmd';
  if (POWERSHELL_INTERPRETERS.has(command)) return 'powershell';
  return undefined;
}

function isNestedInterpreterSwitch(
  value: string,
  nestedShell: DirectoryDeleteShell,
): boolean {
  const lower = value.toLowerCase();
  return nestedShell === 'cmd'
    ? lower === '/c' || lower === '/k'
    : lower === '-command' || lower === '-c' || lower === '/c';
}

function nestedInterpreterPayload(
  tokens: ShellToken[],
  commandIndex: number,
  nestedShell: DirectoryDeleteShell,
): string | undefined {
  const switches =
    nestedShell === 'cmd' ? ['/c', '/k'] : ['-command', '-c', '/c'];
  for (let i = commandIndex + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.quote) continue;
    if (isNestedInterpreterSwitch(token.value, nestedShell)) {
      return tokens
        .slice(i + 1)
        .map((item) => item.value)
        .join(' ')
        .trim();
    }

    const lower = token.value.toLowerCase();
    const attachedSwitch = switches.find(
      (candidate) => lower.startsWith(candidate) && lower.length > candidate.length,
    );
    if (!attachedSwitch) continue;
    return [token.value.slice(attachedSwitch.length), ...tokens.slice(i + 1).map((item) => item.value)]
      .join(' ')
      .trim();
  }
  return undefined;
}

function hasNestedDirectoryDeleteIntent(
  tokens: ShellToken[],
  outerShell: DirectoryDeleteShell,
): boolean {
  for (const index of commandCandidateIndexes(tokens, outerShell)) {
    const command = normalizedCommandName(tokens[index], outerShell);
    const nestedShell = nestedInterpreterShell(command);
    if (!nestedShell) continue;

    const payload = nestedInterpreterPayload(tokens, index, nestedShell);
    if (payload && hasDirectoryDeleteIntent(payload, nestedShell)) return true;
  }
  return false;
}

function hasCmdCallDirectoryDeleteIntent(tokens: ShellToken[]): boolean {
  const first = firstCommandIndex(tokens, 'cmd');
  if (normalizedCommandName(tokens[first], 'cmd') !== 'call') return false;
  const payload = tokens
    .slice(first + 1)
    .map((token) => token.value)
    .join(' ')
    .trim();
  return Boolean(payload) && hasDirectoryDeleteIntent(payload, 'cmd');
}

function hasDirectoryDeleteIntent(
  segment: string,
  shell: DirectoryDeleteShell,
): boolean {
  const parsed = tokenize(segment, shell);
  if (parsed.error) return hasDeleteKeyword(segment, shell);
  const tokens = parsed.value ?? [];
  if (tokens.length === 0 || isOutputOnlySegment(tokens, shell)) return false;
  return (
    hasUnquotedDirectoryDeleteIntent(tokens, shell) ||
    hasNestedDirectoryDeleteIntent(tokens, shell) ||
    (shell === 'cmd' && hasCmdCallDirectoryDeleteIntent(tokens))
  );
}

function hasCompoundGrouping(
  command: string,
  shell: DirectoryDeleteShell,
): boolean {
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (
        shell === 'powershell' &&
        quote === "'" &&
        char === "'" &&
        command[i + 1] === "'"
      ) {
        i += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (
      (shell === 'powershell' && (char === '"' || char === "'")) ||
      (shell === 'cmd' && char === '"')
    ) {
      quote = char;
      continue;
    }
    if (shell === 'powershell' && (char === '{' || char === '}')) return true;
    if (shell === 'cmd' && (char === '(' || char === ')')) return true;
  }
  return false;
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

function isFullyQualifiedFilesystemPath(target: string): boolean {
  const normalized = target.trim().split('/').join('\\');
  if (/^[a-z]:(?!\\)/i.test(normalized) || /^\\(?!\\)/.test(normalized)) {
    return false;
  }
  return path.win32.isAbsolute(normalized);
}

function validateTarget(
  candidate: TargetCandidate,
  shell: DirectoryDeleteShell,
  cwd: string,
  options: DirectoryDeleteValidationOptions,
): DirectoryDeleteValidation | undefined {
  const targetToken = candidate.token;
  const target = targetToken.value;
  const normalized = target.trim().split('/').join('\\');
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
  if (resolved.root) {
    return blocked(
      shell,
      'filesystem-root',
      'Deleting a filesystem root is never allowed.',
      target,
      resolved.resolved,
    );
  }

  const driveRelative = /^[a-z]:(?!\\)/i.test(normalized);
  const extendedPath = /^\\\\[?.]\\/i.test(normalized);
  const driveAbsolute = /^[a-z]:\\/i.test(normalized);
  const unsupportedProvider =
    normalized.includes(':') && !driveRelative && !driveAbsolute && !extendedPath;
  const expressionSyntax =
    shell === 'powershell' && !fullyQuoted && /[(){}]/.test(target);
  const wildcardSyntax = !candidate.literalPath && /[*?\[\]]/.test(target);
  const homeExpansion = /^~(?:[\\/]|$)/.test(target.trim());

  if (
    driveRelative ||
    unsupportedProvider ||
    expressionSyntax ||
    wildcardSyntax ||
    homeExpansion
  ) {
    return blocked(
      shell,
      'ambiguous-target',
      'Use one static filesystem path without drive-relative notation, provider syntax, expressions, home expansion, or wildcards.',
      target,
    );
  }

  if (options.requireFullyQualifiedTarget && !isFullyQualifiedFilesystemPath(target)) {
    return blocked(
      shell,
      'ambiguous-target',
      'Interactive directory deletion requires one fully qualified filesystem path because the session working directory may have changed.',
      target,
    );
  }

  return undefined;
}

function validatePowerShell(
  segment: string,
  cwd: string,
  options: DirectoryDeleteValidationOptions,
): DirectoryDeleteValidation | undefined {
  const parsed = tokenize(segment, 'powershell');
  if (parsed.error) return blocked('powershell', 'invalid-syntax', parsed.error);
  const tokens = parsed.value ?? [];
  const command = basename(tokens[0]?.value ?? '');
  if (!POWERSHELL_DELETE.has(command)) return undefined;

  const targets: TargetCandidate[] = [];
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
      targets.push({ token: next, literalPath: lower === '-literalpath' });
      i += 1;
    } else if (value.startsWith('-')) {
      return blocked(
        'powershell',
        'invalid-syntax',
        `Unsupported PowerShell deletion option: ${value}.`,
      );
    } else {
      targets.push({ token, literalPath: false });
    }
  }

  if (targets.length !== 1) {
    return blocked(
      'powershell',
      'invalid-syntax',
      targets.length === 0
        ? 'The directory deletion command is missing its target path.'
        : 'PowerShell directory deletion accepts exactly one literal target.',
    );
  }

  const roots = targets.map((target) => rootTarget(target.token.value, cwd));
  if (
    !recursive &&
    !POWERSHELL_DIRECTORY_ALIAS.has(command) &&
    !roots.some((item) => item.root)
  ) {
    return undefined;
  }
  for (const target of targets) {
    const failure = validateTarget(target, 'powershell', cwd, options);
    if (failure) return failure;
  }
  return { detected: true, allowed: true, shell: 'powershell' };
}

function validateCmd(
  segment: string,
  cwd: string,
  options: DirectoryDeleteValidationOptions,
): DirectoryDeleteValidation | undefined {
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

  const targets: TargetCandidate[] = [];
  for (const token of tokens.slice(commandIndex + 1)) {
    const value = token.value;
    const lower = value.toLowerCase();
    if (lower === '/s' || lower === '/q') continue;
    if (value.startsWith('/')) {
      return blocked('cmd', 'invalid-syntax', `Unsupported CMD deletion option: ${value}.`);
    }
    targets.push({ token, literalPath: false });
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

  return validateTarget(targets[0], 'cmd', cwd, options) ?? {
    detected: true,
    allowed: true,
    shell: 'cmd',
  };
}

export function validateDirectoryDeleteCommand(
  command: string,
  shellPath: string | undefined,
  cwd = process.cwd(),
  options: DirectoryDeleteValidationOptions = {},
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
  const commandSegments = segments.value ?? [];
  const compoundContext = hasCompoundGrouping(command, shell);
  for (const segment of commandSegments) {
    const result =
      shell === 'powershell'
        ? validatePowerShell(segment, cwd, options)
        : validateCmd(segment, cwd, options);
    if (result) {
      detected = true;
      if (!result.allowed) return result;
      if (compoundContext || commandSegments.length !== 1) {
        return blocked(
          shell,
          'unsupported-context',
          UNSUPPORTED_CONTEXT_DETAIL,
        );
      }
      continue;
    }
    if (hasDirectoryDeleteIntent(segment, shell)) {
      return blocked(
        shell,
        'unsupported-context',
        UNSUPPORTED_CONTEXT_DETAIL,
      );
    }
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
