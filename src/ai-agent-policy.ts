import type { InteractiveInputPolicyMode } from './types.js';

export type AiAgentPolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      agent: string;
      matchedToken: string;
      reason: string;
    };

export const IMMUTABLE_BLOCKED_AI_AGENTS = [
  'codex',
  'opencode',
  'claude',
  'gemini',
  'aider',
  'cursor-agent',
] as const;

const MAX_WRAPPER_DEPTH = 8;
export const MAX_AI_AGENT_POLICY_INPUT_LENGTH = 64 * 1024;
const ALLOWED: AiAgentPolicyDecision = { allowed: true };

type ShellDialect = 'generic' | 'cmd' | 'powershell' | 'posix';

function inferShellDialect(shell?: string): ShellDialect {
  if (!shell) return 'generic';
  const executable = normalizeExecutableToken(shell);
  if (executable === 'cmd') return 'cmd';
  if (executable === 'powershell' || executable === 'pwsh') return 'powershell';
  if (['bash', 'sh', 'zsh', 'fish'].includes(executable)) return 'posix';
  return 'generic';
}

const EXECUTABLE_ALIASES = new Map<string, string>([
  ['codex', 'codex'],
  ['openai-codex', 'codex'],
  ['opencode', 'opencode'],
  ['opencode-ai', 'opencode'],
  ['claude', 'claude'],
  ['claude-code', 'claude'],
  ['gemini', 'gemini'],
  ['gemini-cli', 'gemini'],
  ['aider', 'aider'],
  ['aider-chat', 'aider'],
  ['cursor-agent', 'cursor-agent'],
]);

const PACKAGE_ALIASES = new Map<string, string>([
  ['@openai/codex', 'codex'],
  ['opencode-ai', 'opencode'],
  ['@anthropic-ai/claude-code', 'claude'],
  ['@google/gemini-cli', 'gemini'],
  ['aider-chat', 'aider'],
]);

const EXECUTABLE_SUFFIX = /\.(?:exe|com|cmd|bat|ps1|js|mjs|cjs|py)$/i;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=.*/;

function blocked(agent: string, matchedToken: string, reason: string): AiAgentPolicyDecision {
  return { allowed: false, agent, matchedToken, reason };
}

function stripOuterQuotes(value: string): string {
  let result = value.trim();
  while (
    result.length >= 2 &&
    ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function trimTokenPunctuation(value: string): string {
  return stripOuterQuotes(value).replace(/^[({]+/, '').replace(/[)},;]+$/, '');
}

function removeSimpleShellEscapes(value: string): string {
  return value.replace(/\^(.)/g, '$1').replace(/`(.)/g, '$1');
}

function normalizeExecutableValue(value: string): string {
  const pathNormalized = value.replace(/\\/g, '/');
  const baseName = pathNormalized.split('/').pop() ?? pathNormalized;
  return baseName.toLowerCase().replace(EXECUTABLE_SUFFIX, '');
}

function normalizedExecutableCandidates(token: string): string[] {
  const cleaned = removeSimpleShellEscapes(trimTokenPunctuation(token));
  const candidates = new Set<string>([normalizeExecutableValue(cleaned)]);
  const isAbsoluteWindowsPath = /^[A-Za-z]:[\\/]/.test(cleaned) || cleaned.startsWith('\\\\');

  if (!isAbsoluteWindowsPath && cleaned.includes('\\')) {
    candidates.add(normalizeExecutableValue(cleaned.replace(/\\(.)/g, '$1')));
  }

  return [...candidates];
}

function normalizeExecutableToken(token: string): string {
  return normalizedExecutableCandidates(token)[0] ?? '';
}

function normalizePackageToken(token: string): string {
  let cleaned = removeSimpleShellEscapes(trimTokenPunctuation(token)).toLowerCase();
  if (cleaned.startsWith('npm:')) cleaned = cleaned.slice(4);

  if (cleaned.startsWith('@')) {
    const slashIndex = cleaned.indexOf('/');
    const versionIndex = cleaned.lastIndexOf('@');
    if (slashIndex > 0 && versionIndex > slashIndex) {
      cleaned = cleaned.slice(0, versionIndex);
    }
    return cleaned;
  }

  const versionIndex = cleaned.lastIndexOf('@');
  return versionIndex > 0 ? cleaned.slice(0, versionIndex) : cleaned;
}

function agentFromExecutable(token: string): string | undefined {
  for (const candidate of normalizedExecutableCandidates(token)) {
    const agent = EXECUTABLE_ALIASES.get(candidate);
    if (agent) return agent;
  }
  return undefined;
}

function agentFromPackage(token: string): string | undefined {
  return PACKAGE_ALIASES.get(normalizePackageToken(token));
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let tokenStarted = false;

  const pushCurrent = (): void => {
    if (!tokenStarted) return;
    tokens.push(current);
    current = '';
    tokenStarted = false;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === '`' && quote === '"' && index + 1 < input.length) {
        index += 1;
        current += input[index];
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      pushCurrent();
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  pushCurrent();
  return tokens;
}

function splitShellSegments(input: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  const pushCurrent = (): void => {
    const trimmed = current.trim();
    if (trimmed) segments.push(trimmed);
    current = '';
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote) {
      current += char;
      if (char === quote && input[index - 1] !== '`') quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    const pair = input.slice(index, index + 2);
    if (pair === '&&' || pair === '||') {
      pushCurrent();
      index += 1;
      continue;
    }

    if (char === ';' || char === '\n' || char === '\r' || char === '|') {
      pushCurrent();
      continue;
    }

    if (char === '&') {
      if (!current.trim()) {
        current += '& ';
      } else {
        pushCurrent();
      }
      continue;
    }

    current += char;
  }

  pushCurrent();
  return segments;
}

function extractCommandSubstitutions(input: string): string[] {
  const substitutions: string[] = [];
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote === "'") {
      if (char === "'") quote = null;
      continue;
    }

    if (char === "'" && quote === null) {
      quote = "'";
      continue;
    }

    if (char === '"') {
      quote = quote === '"' ? null : '"';
      continue;
    }

    if (char === '$' && input[index + 1] === '(') {
      let depth = 1;
      let cursor = index + 2;
      let nestedQuote: '"' | "'" | null = null;
      for (; cursor < input.length && depth > 0; cursor += 1) {
        const nestedChar = input[cursor];
        if (nestedQuote) {
          if (nestedChar === nestedQuote) nestedQuote = null;
          continue;
        }
        if (nestedChar === '"' || nestedChar === "'") {
          nestedQuote = nestedChar;
          continue;
        }
        if (nestedChar === '(') depth += 1;
        if (nestedChar === ')') depth -= 1;
      }
      if (depth === 0) {
        substitutions.push(input.slice(index + 2, cursor - 1));
        index = cursor - 1;
      }
      continue;
    }

    if (char === '`') {
      const end = input.indexOf('`', index + 1);
      if (end > index + 1) {
        substitutions.push(input.slice(index + 1, end));
        index = end;
      }
    }
  }

  return substitutions;
}

function extractBraceBodies(input: string): string[] {
  const bodies: string[] = [];
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote && input[index - 1] !== '\\' && input[index - 1] !== '`') {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char !== '{') continue;

    let depth = 1;
    let nestedQuote: '"' | "'" | null = null;
    let cursor = index + 1;
    for (; cursor < input.length && depth > 0; cursor += 1) {
      const nestedChar = input[cursor];
      if (nestedQuote) {
        if (
          nestedChar === nestedQuote &&
          input[cursor - 1] !== '\\' &&
          input[cursor - 1] !== '`'
        ) {
          nestedQuote = null;
        }
        continue;
      }
      if (nestedChar === '"' || nestedChar === "'") {
        nestedQuote = nestedChar;
        continue;
      }
      if (nestedChar === '{') depth += 1;
      if (nestedChar === '}') depth -= 1;
    }
    if (depth === 0) {
      bodies.push(input.slice(index + 1, cursor - 1));
      index = cursor - 1;
    }
  }
  return bodies;
}

function firstNonOptionIndex(tokens: string[], start = 0): number {
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index] === '--') return index + 1;
    if (!tokens[index].startsWith('-')) return index;
  }
  return -1;
}

function agentFromRuntimePath(token: string): string | undefined {
  const cleaned = removeSimpleShellEscapes(trimTokenPunctuation(token)).replace(/\\/g, '/');
  const segments = cleaned.split('/').filter(Boolean);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());

  for (let index = 0; index < lowerSegments.length; index += 1) {
    const segment = lowerSegments[index];
    const previous = lowerSegments[index - 1];

    if (segment === 'node_modules' && index + 1 < segments.length) {
      const packageToken = segments[index + 1].startsWith('@') && index + 2 < segments.length
        ? `${segments[index + 1]}/${segments[index + 2]}`
        : segments[index + 1];
      const packageAgent = agentFromPackage(packageToken);
      if (packageAgent) return packageAgent;
    }

    if (previous === 'site-packages' || previous === 'dist-packages') {
      const packageAgent =
        agentFromPackage(segment.replace(/_/g, '-')) ??
        EXECUTABLE_ALIASES.get(segment.replace(/_/g, '-'));
      if (packageAgent) return packageAgent;
    }

    const executableAgent = EXECUTABLE_ALIASES.get(segment.replace(EXECUTABLE_SUFFIX, ''));
    if (!executableAgent) continue;

    const nextDirectory = lowerSegments[index + 1];
    const entryPoint = lowerSegments[index + 2]?.replace(EXECUTABLE_SUFFIX, '');
    if (
      ['bin', 'dist'].includes(nextDirectory) &&
      ['index', 'cli', executableAgent].includes(entryPoint)
    ) {
      return executableAgent;
    }
  }

  return undefined;
}

function inspectTargetToken(token: string, reason: string): AiAgentPolicyDecision {
  const agent = agentFromPackage(token) ?? agentFromExecutable(token);
  return agent ? blocked(agent, token, reason) : ALLOWED;
}

function inspectRuntimeTargetToken(token: string, reason: string): AiAgentPolicyDecision {
  const agent =
    agentFromPackage(token) ??
    agentFromExecutable(token) ??
    agentFromRuntimePath(token);
  return agent ? blocked(agent, token, reason) : ALLOWED;
}

function inspectLauncherArguments(
  tokens: string[],
  reason: string,
  depth: number,
  dialect: ShellDialect = 'generic',
): AiAgentPolicyDecision {
  const packageOptions = new Set(['-p', '--package']);
  const commandOptions = new Set(['--call', '-c']);
  const executableOptions = new Set(['--shell']);
  const ignoredValueOptions = new Set([
    '--node-options',
    '--cache',
    '--workspace',
    '-w',
    '--prefix',
    '--userconfig',
    '--registry',
    '--script-shell',
    '--loglevel',
  ]);
  const optionsWithValues = new Set([
    ...packageOptions,
    ...commandOptions,
    ...executableOptions,
    ...ignoredValueOptions,
  ]);

  const inspectOptionValue = (option: string, value: string): AiAgentPolicyDecision => {
    if (commandOptions.has(option)) {
      return evaluateInternal(value, depth + 1, dialect);
    }
    if (packageOptions.has(option) || executableOptions.has(option)) {
      return inspectTargetToken(value, reason);
    }
    return ALLOWED;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const lower = token.toLowerCase();

    if (token === '--') {
      if (index + 1 < tokens.length) {
        return inspectTargetToken(tokens[index + 1], reason);
      }
      return ALLOWED;
    }

    const equalsIndex = token.indexOf('=');
    if (equalsIndex > 0) {
      const option = token.slice(0, equalsIndex).toLowerCase();
      const value = token.slice(equalsIndex + 1);
      if (optionsWithValues.has(option)) {
        const decision = inspectOptionValue(option, value);
        if (!decision.allowed) return decision;
        continue;
      }
    }

    if (optionsWithValues.has(lower)) {
      if (index + 1 < tokens.length) {
        const decision = inspectOptionValue(lower, tokens[index + 1]);
        if (!decision.allowed) return decision;
        index += 1;
      }
      continue;
    }

    if (token.startsWith('-')) continue;
    return inspectTargetToken(token, reason);
  }

  return ALLOWED;
}

function decodePowerShellCommand(encoded: string): string | null {
  try {
    const normalized = stripOuterQuotes(encoded).replace(/\s+/g, '');
    if (!normalized || normalized.length % 4 === 1) return null;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return null;

    const bytes = Buffer.from(normalized, 'base64');
    if (bytes.length === 0 || bytes.length % 2 !== 0) return null;

    const sourceWithoutPadding = normalized.replace(/=+$/, '');
    const decodedWithoutPadding = bytes.toString('base64').replace(/=+$/, '');
    if (decodedWithoutPadding !== sourceWithoutPadding) return null;

    const command = bytes.toString('utf16le').trim();
    return command || null;
  } catch {
    return null;
  }
}

function inspectRuntime(tokens: string[], runtime: string): AiAgentPolicyDecision {
  if (runtime === 'python' || runtime === 'python3' || runtime === 'py') {
    for (let index = 1; index < tokens.length; index += 1) {
      const module = readOptionValue(tokens, index, new Set(['-m']));
      if (module) {
        const moduleName = module.value.split('.')[0].replace(/_/g, '-');
        return inspectRuntimeTargetToken(moduleName, 'blocked AI agent Python module');
      }
      if (tokens[index] === '-c' || tokens[index].startsWith('-c=')) return ALLOWED;
    }

    const scriptIndex = findDelegatedCommandIndex(
      tokens,
      1,
      new Set(['-W', '-X', '--check-hash-based-pycs']),
    );
    return scriptIndex >= 0 && scriptIndex < tokens.length
      ? inspectRuntimeTargetToken(tokens[scriptIndex], 'blocked AI agent script runtime target')
      : ALLOWED;
  }

  if (runtime === 'node' || runtime === 'nodejs') {
    if (
      tokens.slice(1).some((token) =>
        ['-e', '--eval', '-p', '--print'].includes(token.split('=')[0]),
      )
    ) {
      return ALLOWED;
    }
    const scriptIndex = findDelegatedCommandIndex(
      tokens,
      1,
      new Set([
        '-r',
        '--require',
        '--import',
        '--loader',
        '--experimental-loader',
        '--conditions',
        '--openssl-config',
        '--icu-data-dir',
        '--env-file',
      ]),
    );
    return scriptIndex >= 0 && scriptIndex < tokens.length
      ? inspectRuntimeTargetToken(tokens[scriptIndex], 'blocked AI agent script runtime target')
      : ALLOWED;
  }

  if (runtime === 'bun') {
    let index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set([
        '--cwd', '--config', '--env-file', '--preload', '-r', '--conditions',
        '--smol', '--inspect', '--inspect-brk', '--inspect-wait',
      ]),
    );
    if (index < 0) return ALLOWED;
    if (tokens[index]?.toLowerCase() === 'run') {
      index = findDelegatedCommandIndex(
        tokens,
        index + 1,
        new Set(['--cwd', '--env-file', '--preload', '-r']),
      );
    }
    return index >= 0 && index < tokens.length
      ? inspectRuntimeTargetToken(tokens[index], 'blocked AI agent script runtime target')
      : ALLOWED;
  }

  if (runtime === 'deno') {
    const subcommandIndex = findDelegatedCommandIndex(
      tokens,
      1,
      new Set([
        '--config', '--import-map', '--cert', '--location', '--seed', '--v8-flags',
        '--lock', '--node-modules-dir', '--vendor',
      ]),
    );
    if (subcommandIndex < 0 || tokens[subcommandIndex]?.toLowerCase() !== 'run') {
      return ALLOWED;
    }
    const scriptIndex = findDelegatedCommandIndex(
      tokens,
      subcommandIndex + 1,
      new Set([
        '--config', '--import-map', '--cert', '--location', '--seed', '--v8-flags',
        '--lock', '--node-modules-dir', '--watch', '--watch-exclude',
      ]),
    );
    return scriptIndex >= 0 && scriptIndex < tokens.length
      ? inspectRuntimeTargetToken(tokens[scriptIndex], 'blocked AI agent script runtime target')
      : ALLOWED;
  }

  const index = firstNonOptionIndex(tokens, 1);
  return index >= 0
    ? inspectRuntimeTargetToken(tokens[index], 'blocked AI agent script runtime target')
    : ALLOWED;
}

interface OptionValueMatch {
  value: string;
  span: number;
}

function readOptionValue(
  tokens: string[],
  index: number,
  optionsWithValues: ReadonlySet<string>,
): OptionValueMatch | null {
  const token = tokens[index];
  const equalsIndex = token.indexOf('=');
  if (equalsIndex > 0 && optionsWithValues.has(token.slice(0, equalsIndex))) {
    return { value: token.slice(equalsIndex + 1), span: 1 };
  }

  for (const option of optionsWithValues) {
    if (/^-[A-Za-z]$/.test(option) && token.startsWith(option) && token.length > option.length) {
      return { value: token.slice(option.length), span: 1 };
    }
  }

  if (optionsWithValues.has(token) && index + 1 < tokens.length) {
    return { value: tokens[index + 1], span: 2 };
  }
  return null;
}

function findDelegatedCommandIndex(
  tokens: string[],
  start: number,
  optionsWithValues: ReadonlySet<string> = new Set(),
  commandMarkers: ReadonlySet<string> = new Set(),
  skipAssignments = false,
): number {
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index];
    const lower = token.toLowerCase();
    if (token === '--' || commandMarkers.has(lower)) return index + 1;

    const optionValue = readOptionValue(tokens, index, optionsWithValues);
    if (optionValue) {
      index += optionValue.span;
      continue;
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    if (skipAssignments && ENV_ASSIGNMENT.test(token)) {
      index += 1;
      continue;
    }
    return index;
  }
  return -1;
}

function findPackageManagerSubcommandIndex(tokens: string[], manager: string): number {
  if (manager === 'npm') {
    return findDelegatedCommandIndex(
      tokens,
      1,
      new Set([
        '--prefix', '--workspace', '-w', '--userconfig', '--registry', '--cache',
        '--loglevel', '--script-shell', '--scope', '--otp', '--provenance-file',
      ]),
    );
  }

  if (manager === 'pnpm') {
    return findDelegatedCommandIndex(
      tokens,
      1,
      new Set([
        '--dir', '-C', '--filter', '-F', '--workspace-dir', '--config',
        '--store-dir', '--virtual-store-dir', '--package-import-method',
        '--network-concurrency', '--fetch-retries', '--reporter',
      ]),
    );
  }

  return findDelegatedCommandIndex(
    tokens,
    1,
    new Set([
      '--cwd', '--cache-folder', '--global-folder', '--modules-folder', '--mutex',
      '--network-timeout', '--registry', '--use-yarnrc', '--preferred-cache-folder',
    ]),
  );
}

function inspectPrefixWrapper(
  tokens: string[],
  depth: number,
  dialect: ShellDialect = 'generic',
): AiAgentPolicyDecision {
  const command = normalizeExecutableToken(tokens[0]);
  let index = 1;

  if (command === 'env') {
    const commandStringOptions = new Set(['-S', '--split-string']);
    for (let optionIndex = 1; optionIndex < tokens.length; optionIndex += 1) {
      const match = readOptionValue(tokens, optionIndex, commandStringOptions);
      if (!match) continue;
      const decision = evaluateInternal(match.value, depth + 1, dialect);
      if (!decision.allowed) return decision;
      optionIndex += match.span - 1;
    }
    index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set(['-u', '--unset', '-C', '--chdir', ...commandStringOptions]),
      new Set(),
      true,
    );
  } else if (command === 'sudo') {
    index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set([
        '-u', '-U', '--user', '--other-user', '-g', '--group', '-h', '--host',
        '-p', '--prompt', '-C', '--close-from', '-D', '--chdir', '-R',
        '--chroot', '-T', '--command-timeout', '-r', '--role', '-t', '--type',
      ]),
    );
  } else if (command === 'doas') {
    index = findDelegatedCommandIndex(tokens, 1, new Set(['-C', '-u']));
  } else if (command === 'exec') {
    index = findDelegatedCommandIndex(tokens, 1, new Set(['-a', '--argv0']));
  } else if (command === 'xargs') {
    index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set([
        '-a', '--arg-file', '-E', '--eof', '-I', '--replace', '-L',
        '--max-lines', '-n', '--max-args', '-P', '--max-procs', '-s',
        '--max-chars', '-d', '--delimiter', '--process-slot-var',
      ]),
    );
  } else if (command === 'time') {
    index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set(['-f', '--format', '-o', '--output']),
    );
  } else if (command === 'nice') {
    index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set(['-n', '--adjustment']),
    );
  } else if (command === 'timeout') {
    const durationIndex = findDelegatedCommandIndex(
      tokens,
      1,
      new Set(['-s', '--signal', '-k', '--kill-after']),
    );
    index = durationIndex >= 0 ? durationIndex + 1 : -1;
  } else if (command === 'runas') {
    while (index < tokens.length && tokens[index].startsWith('/')) index += 1;
  } else {
    index = findDelegatedCommandIndex(tokens, 1);
  }

  if (index < 0 || index >= tokens.length) return ALLOWED;
  return evaluateInternal(tokens.slice(index).join(' '), depth + 1, dialect);
}

function normalizePowerShellOption(token: string): string {
  return token.toLowerCase().replace(/^\//, '-');
}

function matchesPowerShellOption(
  option: string,
  fullNames: readonly string[],
  shortAliases: readonly string[],
): boolean {
  if (shortAliases.includes(option)) return true;
  return option.length >= 4 && fullNames.some((fullName) => fullName.startsWith(option));
}

function isShellCommandOption(token: string): boolean {
  const lower = token.toLowerCase();
  if (lower === '--command') return true;
  if (!/^-[a-z]+$/.test(lower)) return false;
  const flags = lower.slice(1);
  return flags.length <= 4 && flags.includes('c');
}

function readPowerShellOptionValue(
  tokens: string[],
  index: number,
  fullNames: readonly string[],
  shortAliases: readonly string[] = [],
): OptionValueMatch | null {
  const raw = tokens[index];
  const normalized = normalizePowerShellOption(raw);
  const separatorIndex = Math.min(
    ...[':', '=']
      .map((separator) => normalized.indexOf(separator))
      .filter((position) => position > 1),
    Number.POSITIVE_INFINITY,
  );
  if (Number.isFinite(separatorIndex)) {
    const option = normalized.slice(0, separatorIndex);
    if (matchesPowerShellOption(option, fullNames, shortAliases)) {
      return { value: raw.slice(separatorIndex + 1), span: 1 };
    }
  }
  if (
    matchesPowerShellOption(normalized, fullNames, shortAliases) &&
    index + 1 < tokens.length
  ) {
    return { value: tokens[index + 1], span: 2 };
  }
  return null;
}

function inspectStartProcess(tokens: string[]): AiAgentPolicyDecision {
  const valueOptions = [
    '-argumentlist',
    '-credential',
    '-workingdirectory',
    '-redirectstandarderror',
    '-redirectstandardinput',
    '-redirectstandardoutput',
    '-verb',
    '-windowstyle',
    '-environment',
  ] as const;

  let index = 1;
  while (index < tokens.length) {
    const filePath = readPowerShellOptionValue(
      tokens,
      index,
      ['-filepath'],
      ['-f', '-fi'],
    );
    if (filePath) {
      return inspectTargetToken(filePath.value, 'blocked AI agent Start-Process target');
    }

    const optionValue = readPowerShellOptionValue(tokens, index, valueOptions);
    if (optionValue) {
      index += optionValue.span;
      continue;
    }

    const token = tokens[index];
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    return inspectTargetToken(token, 'blocked AI agent Start-Process target');
  }
  return ALLOWED;
}

function extractCmdWrapperPayload(segment: string): string | null {
  const match = segment.match(
    /^\s*(?:"[^"]*"|\S+)(?:\s+\/[^\s]+)*\s+\/[ck]\s+([\s\S]+)$/i,
  );
  return match?.[1] ? stripOuterQuotes(match[1]) : null;
}

function extractCmdStartPayload(segment: string): string | null {
  const match = segment.match(/^\s*start(?:\.exe)?\s+"(?:[^"]|"")*"\s+([\s\S]+)$/i);
  return match?.[1]?.trim() || null;
}

function inspectCmdPayload(payload: string, depth: number): AiAgentPolicyDecision {
  const tokens = tokenize(payload);
  if (normalizeExecutableToken(tokens[0] ?? '') !== 'start') {
    return evaluateInternal(payload, depth + 1, 'cmd');
  }

  const titledPayload = extractCmdStartPayload(payload);
  if (titledPayload) return evaluateInternal(titledPayload, depth + 1, 'cmd');

  let index = 1;
  while (index < tokens.length && (tokens[index] === '' || tokens[index].startsWith('/'))) {
    index += 1;
  }
  return index < tokens.length
    ? evaluateInternal(tokens.slice(index).join(' '), depth + 1, 'cmd')
    : ALLOWED;
}

function findInlineIfCommandIndex(tokens: string[]): number {
  let index = 1;
  if (tokens[index]?.toLowerCase() === '/i') index += 1;
  if (tokens[index]?.toLowerCase() === 'not') index += 1;

  const condition = tokens[index]?.toLowerCase();
  if (!condition) return -1;
  if (['errorlevel', 'cmdextversion', 'defined', 'exist'].includes(condition)) {
    index += 2;
  } else if (condition.includes('==')) {
    index += 1;
  } else {
    return -1;
  }
  return index < tokens.length ? index : -1;
}

function inspectSegment(
  segment: string,
  depth: number,
  dialect: ShellDialect = 'generic',
): AiAgentPolicyDecision {
  let tokens = tokenize(segment);
  while (tokens.length > 0 && ENV_ASSIGNMENT.test(tokens[0])) tokens = tokens.slice(1);
  while (['&', '.', '{', '('].includes(tokens[0])) tokens = tokens.slice(1);
  if (tokens.length === 0) return ALLOWED;

  const directAgent = agentFromExecutable(tokens[0]);
  if (directAgent) {
    return blocked(directAgent, tokens[0], 'blocked AI agent executable');
  }

  const command = normalizeExecutableToken(tokens[0]);

  if (['then', 'else', 'do'].includes(command)) {
    return tokens.length > 1
      ? evaluateInternal(tokens.slice(1).join(' '), depth + 1, dialect)
      : ALLOWED;
  }

  if (command === 'if') {
    const commandIndex = findInlineIfCommandIndex(tokens);
    if (commandIndex >= 0) {
      return evaluateInternal(tokens.slice(commandIndex).join(' '), depth + 1, dialect);
    }
  }

  if (command === 'for') {
    const doIndex = tokens.findIndex(
      (token, index) => index > 0 && token.toLowerCase() === 'do',
    );
    if (doIndex >= 0 && doIndex + 1 < tokens.length) {
      return evaluateInternal(tokens.slice(doIndex + 1).join(' '), depth + 1, dialect);
    }
  }

  if (command === 'case') {
    const inIndex = tokens.findIndex(
      (token, index) => index > 0 && token.toLowerCase() === 'in',
    );
    const patternIndex = tokens.findIndex(
      (token, index) => index > inIndex && token.endsWith(')'),
    );
    if (inIndex >= 0 && patternIndex >= 0 && patternIndex + 1 < tokens.length) {
      return evaluateInternal(tokens.slice(patternIndex + 1).join(' '), depth + 1, dialect);
    }
  }

  if (command === 'cmd') {
    const rawPayload = extractCmdWrapperPayload(segment);
    if (rawPayload) {
      return inspectCmdPayload(rawPayload, depth);
    }
    const switchIndex = tokens.findIndex((token) => ['/c', '/k'].includes(token.toLowerCase()));
    if (switchIndex >= 0 && switchIndex + 1 < tokens.length) {
      return inspectCmdPayload(tokens.slice(switchIndex + 1).join(' '), depth);
    }
  }

  if (command === 'powershell' || command === 'pwsh') {
    for (let index = 1; index < tokens.length; index += 1) {
      const option = normalizePowerShellOption(tokens[index]);
      if (matchesPowerShellOption(option, ['-encodedcommand'], ['-enc'])) {
        const decoded = index + 1 < tokens.length ? decodePowerShellCommand(tokens[index + 1]) : null;
        return decoded
          ? evaluateInternal(decoded, depth + 1, 'powershell')
          : blocked('unknown', tokens[index], 'uninspectable PowerShell encoded command');
      }
      if (
        matchesPowerShellOption(
          option,
          ['-command', '-commandwithargs'],
          ['-c'],
        ) &&
        index + 1 < tokens.length
      ) {
        return evaluateInternal(tokens.slice(index + 1).join(' '), depth + 1, 'powershell');
      }
      if (
        matchesPowerShellOption(option, ['-file'], ['-f']) &&
        index + 1 < tokens.length
      ) {
        return inspectTargetToken(tokens[index + 1], 'blocked AI agent PowerShell file target');
      }
    }
  }

  if (['bash', 'sh', 'zsh', 'fish'].includes(command)) {
    const commandIndex = tokens.findIndex(
      (token, index) => index > 0 && isShellCommandOption(token),
    );
    if (commandIndex >= 0 && commandIndex + 1 < tokens.length) {
      return evaluateInternal(tokens.slice(commandIndex + 1).join(' '), depth + 1, 'posix');
    }
  }

  if (command === 'invoke-expression' || command === 'iex') {
    return tokens.length > 1
      ? evaluateInternal(tokens.slice(1).join(' '), depth + 1, 'powershell')
      : ALLOWED;
  }

  if (command === 'start-process' || command === 'saps') {
    return inspectStartProcess(tokens);
  }

  if (command === 'call') {
    return tokens.length > 1
      ? evaluateInternal(tokens.slice(1).join(' '), depth + 1, 'cmd')
      : ALLOWED;
  }

  if (command === 'start') {
    if (dialect === 'cmd') return inspectCmdPayload(segment, depth);
    if (dialect === 'powershell') return inspectStartProcess(tokens);
    if (dialect === 'posix') return ALLOWED;

    const powerShellDecision = inspectStartProcess(tokens);
    if (!powerShellDecision.allowed) return powerShellDecision;

    const titledPayload = extractCmdStartPayload(segment);
    if (titledPayload) {
      const cmdDecision = evaluateInternal(titledPayload, depth + 1, 'cmd');
      if (!cmdDecision.allowed) return cmdDecision;
    }

    let index = 1;
    while (index < tokens.length && (tokens[index] === '' || tokens[index].startsWith('/'))) index += 1;
    return index < tokens.length
      ? evaluateInternal(tokens.slice(index).join(' '), depth + 1, dialect)
      : ALLOWED;
  }

  if (command === 'wsl') {
    const index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set(['-d', '--distribution', '-u', '--user', '--cd', '--shell-type']),
      new Set(['-e', '--exec']),
    );
    return index >= 0 && index < tokens.length
      ? evaluateInternal(tokens.slice(index).join(' '), depth + 1, 'posix')
      : ALLOWED;
  }

  if (command === 'corepack') {
    const index = firstNonOptionIndex(tokens, 1);
    if (index < 0) return ALLOWED;
    const delegated = tokens.slice(index);
    delegated[0] = normalizePackageToken(delegated[0]);
    return evaluateInternal(delegated.join(' '), depth + 1, dialect);
  }

  if (
    [
      'sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'setsid',
      'runas', 'xargs', 'time', 'nice', 'timeout',
    ].includes(command)
  ) {
    return inspectPrefixWrapper(tokens, depth, dialect);
  }

  if (command === 'npx' || command === 'bunx' || command === 'uvx') {
    return inspectLauncherArguments(
      tokens.slice(1),
      `blocked AI agent ${command} target`,
      depth,
      dialect,
    );
  }

  if (command === 'npm') {
    const subcommandIndex = findPackageManagerSubcommandIndex(tokens, command);
    if (
      subcommandIndex >= 0 &&
      ['exec', 'x'].includes(tokens[subcommandIndex]?.toLowerCase())
    ) {
      return inspectLauncherArguments(
        tokens.slice(subcommandIndex + 1),
        'blocked AI agent npm exec target',
        depth,
        dialect,
      );
    }
  }

  if (command === 'pnpm' || command === 'yarn') {
    const subcommandIndex = findPackageManagerSubcommandIndex(tokens, command);
    if (subcommandIndex >= 0 && tokens[subcommandIndex]?.toLowerCase() === 'dlx') {
      return inspectLauncherArguments(
        tokens.slice(subcommandIndex + 1),
        `blocked AI agent ${command} dlx target`,
        depth,
        dialect,
      );
    }
  }

  if (command === 'pipx' && tokens[1]?.toLowerCase() === 'run') {
    return inspectLauncherArguments(
      tokens.slice(2),
      'blocked AI agent pipx target',
      depth,
      dialect,
    );
  }

  if (['node', 'nodejs', 'python', 'python3', 'py', 'bun', 'deno'].includes(command)) {
    return inspectRuntime(tokens, command);
  }

  return ALLOWED;
}

function evaluateInternal(
  input: string,
  depth: number,
  dialect: ShellDialect = 'generic',
): AiAgentPolicyDecision {
  if (input.length > MAX_AI_AGENT_POLICY_INPUT_LENGTH) {
    return blocked('unknown', '<input-length>', 'AI agent policy input length exceeded');
  }
  if (!input.trim()) return ALLOWED;
  if (depth > MAX_WRAPPER_DEPTH) {
    return blocked('unknown', '<wrapper-depth>', 'AI agent policy wrapper depth exceeded');
  }

  for (const substitution of extractCommandSubstitutions(input)) {
    const decision = evaluateInternal(substitution, depth + 1, dialect);
    if (!decision.allowed) return decision;
  }

  for (const body of extractBraceBodies(input)) {
    const decision = evaluateInternal(body, depth + 1, dialect);
    if (!decision.allowed) return decision;
  }

  for (const segment of splitShellSegments(input)) {
    const decision = inspectSegment(segment, depth, dialect);
    if (!decision.allowed) return decision;
  }

  return ALLOWED;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeCodeStringLiteral(value: string): string {
  return value.replace(/\\(['"\\])/g, '$1');
}

function standaloneQuotedLiteral(input: string): boolean {
  const trimmed = input.trim();
  return /^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')$/.test(trimmed);
}

const CODE_STRING_LITERAL = String.raw`(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')`;

function inspectExecutionCalls(
  input: string,
  receiverPattern: string,
  methodPattern: string,
  commandStringMethods: ReadonlySet<string>,
  reason: string,
): AiAgentPolicyDecision {
  const pattern = new RegExp(
    String.raw`${receiverPattern}\s*\.\s*(${methodPattern})\s*\(\s*(?:\[\s*|(?:args|cmd|command|executable)\s*=\s*\[?\s*|\{[\s\S]{0,256}?\b(?:cmd|command)\s*:\s*\[?\s*)?${CODE_STRING_LITERAL}`,
    'gsi',
  );

  for (const match of input.matchAll(pattern)) {
    const method = match[1].toLowerCase();
    const target = decodeCodeStringLiteral(match[2] ?? match[3] ?? '');
    if (!target) continue;
    const decision = commandStringMethods.has(method)
      ? evaluateInternal(target, 1)
      : inspectRuntimeTargetToken(target, reason);
    if (!decision.allowed) return decision;
  }
  return ALLOWED;
}

function collectAliases(input: string, patterns: RegExp[]): string[] {
  const aliases = new Set<string>();
  for (const pattern of patterns) {
    for (const match of input.matchAll(pattern)) {
      if (match[1]) aliases.add(match[1]);
    }
  }
  return [...aliases];
}

interface StandaloneExecutionAlias {
  alias: string;
  method: string;
}

function inspectStandaloneExecutionCalls(
  input: string,
  aliases: StandaloneExecutionAlias[],
  commandStringMethods: ReadonlySet<string>,
  reason: string,
): AiAgentPolicyDecision {
  for (const { alias, method } of aliases) {
    const pattern = new RegExp(
      String.raw`\b${escapeRegExp(alias)}\s*\(\s*(?:\[\s*|(?:args|cmd|command|executable)\s*=\s*\[?\s*)?${CODE_STRING_LITERAL}`,
      'gsi',
    );
    for (const match of input.matchAll(pattern)) {
      const target = decodeCodeStringLiteral(match[1] ?? match[2] ?? '');
      if (!target) continue;
      const decision = commandStringMethods.has(method.toLowerCase())
        ? evaluateInternal(target, 1)
        : inspectRuntimeTargetToken(target, reason);
      if (!decision.allowed) return decision;
    }
  }
  return ALLOWED;
}

function collectNodeNamedExecutionAliases(input: string): StandaloneExecutionAlias[] {
  const aliases: StandaloneExecutionAlias[] = [];
  const methods = new Set([
    'spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork', 'exec', 'execSync',
  ]);
  const patterns = [
    /\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/g,
    /\bimport\s*\{([^}]*)\}\s*from\s*['"](?:node:)?child_process['"]/g,
  ];

  for (const pattern of patterns) {
    for (const match of input.matchAll(pattern)) {
      for (const binding of (match[1] ?? '').split(',')) {
        const parts = binding.trim().split(/\s*(?::|\bas\b)\s*/i);
        const method = parts[0];
        const alias = parts[1] || method;
        if (methods.has(method)) aliases.push({ alias, method });
      }
    }
  }
  return aliases;
}

function collectPythonNamedExecutionAliases(
  input: string,
  moduleName: string,
  methods: ReadonlySet<string>,
): StandaloneExecutionAlias[] {
  const aliases: StandaloneExecutionAlias[] = [];
  const pattern = new RegExp(
    String.raw`\bfrom\s+${escapeRegExp(moduleName)}\s+import\s+([^;\n]+)`,
    'g',
  );
  for (const match of input.matchAll(pattern)) {
    for (const binding of (match[1] ?? '').split(',')) {
      const parts = binding.trim().split(/\s+as\s+/i);
      const method = parts[0];
      const alias = parts[1] || method;
      if (methods.has(method)) aliases.push({ alias, method });
    }
  }
  return aliases;
}

function inspectNodeReplInput(input: string): AiAgentPolicyDecision {
  const receivers = [String.raw`(?:require\s*\(\s*['"](?:node:)?child_process['"]\s*\)|child_process)`];
  const aliases = collectAliases(input, [
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/g,
    /\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"](?:node:)?child_process['"]/g,
  ]);
  receivers.push(...aliases.map((alias) => escapeRegExp(alias)));

  for (const receiver of receivers) {
    const decision = inspectExecutionCalls(
      input,
      receiver,
      'spawn|spawnsync|execfile|execfilesync|fork|exec|execsync',
      new Set(['exec', 'execsync']),
      'blocked AI agent Node REPL process target',
    );
    if (!decision.allowed) return decision;
  }

  return inspectStandaloneExecutionCalls(
    input,
    collectNodeNamedExecutionAliases(input),
    new Set(['exec', 'execsync']),
    'blocked AI agent Node REPL process target',
  );
}

function inspectPythonReplInput(input: string): AiAgentPolicyDecision {
  const subprocessMethods = new Set(['run', 'Popen', 'call', 'check_call', 'check_output']);
  const subprocessCommandMethods = new Set(
    [...subprocessMethods].map((method) => method.toLowerCase()),
  );
  const subprocessReceivers = [
    String.raw`(?:__import__\s*\(\s*['"]subprocess['"]\s*\)|subprocess)`,
  ];
  const subprocessAliases = collectAliases(input, [
    /\bimport\s+subprocess\s+as\s+([A-Za-z_][\w]*)/g,
  ]);
  subprocessReceivers.push(...subprocessAliases.map((alias) => escapeRegExp(alias)));

  for (const receiver of subprocessReceivers) {
    const decision = inspectExecutionCalls(
      input,
      receiver,
      'run|popen|call|check_call|check_output',
      subprocessCommandMethods,
      'blocked AI agent Python REPL process target',
    );
    if (!decision.allowed) return decision;
  }

  const namedDecision = inspectStandaloneExecutionCalls(
    input,
    collectPythonNamedExecutionAliases(input, 'subprocess', subprocessMethods),
    subprocessCommandMethods,
    'blocked AI agent Python REPL process target',
  );
  if (!namedDecision.allowed) return namedDecision;

  const osMethods = new Set(['system', 'popen']);
  const osReceivers = [String.raw`(?:__import__\s*\(\s*['"]os['"]\s*\)|os)`];
  const osAliases = collectAliases(input, [
    /\bimport\s+os\s+as\s+([A-Za-z_][\w]*)/g,
  ]);
  osReceivers.push(...osAliases.map((alias) => escapeRegExp(alias)));

  for (const receiver of osReceivers) {
    const decision = inspectExecutionCalls(
      input,
      receiver,
      'system|popen',
      osMethods,
      'blocked AI agent Python REPL command string',
    );
    if (!decision.allowed) return decision;
  }

  return inspectStandaloneExecutionCalls(
    input,
    collectPythonNamedExecutionAliases(input, 'os', osMethods),
    osMethods,
    'blocked AI agent Python REPL command string',
  );
}

function inspectBunReplInput(input: string): AiAgentPolicyDecision {
  const nodeDecision = inspectNodeReplInput(input);
  if (!nodeDecision.allowed) return nodeDecision;
  return inspectExecutionCalls(
    input,
    'Bun',
    'spawn|spawnsync',
    new Set(),
    'blocked AI agent Bun REPL process target',
  );
}

function inspectDenoReplInput(input: string): AiAgentPolicyDecision {
  const nodeDecision = inspectNodeReplInput(input);
  if (!nodeDecision.allowed) return nodeDecision;
  const pattern = new RegExp(
    String.raw`(?:new\s+)?Deno\s*\.\s*Command\s*\(\s*${CODE_STRING_LITERAL}`,
    'gsi',
  );
  for (const match of input.matchAll(pattern)) {
    const target = decodeCodeStringLiteral(match[1] ?? match[2] ?? '');
    const decision = inspectRuntimeTargetToken(target, 'blocked AI agent Deno REPL process target');
    if (!decision.allowed) return decision;
  }
  return ALLOWED;
}

export function evaluateAiAgentInteractiveInput(
  input: string,
  mode: InteractiveInputPolicyMode,
): AiAgentPolicyDecision {
  try {
    if (mode === 'command') return evaluateInternal(input, 0, 'generic');
    if (mode === 'cmd-shell') return evaluateInternal(input, 0, 'cmd');
    if (mode === 'powershell-shell') return evaluateInternal(input, 0, 'powershell');
    if (mode === 'posix-shell') return evaluateInternal(input, 0, 'posix');
    if (input.length > MAX_AI_AGENT_POLICY_INPUT_LENGTH) {
      return blocked('unknown', '<input-length>', 'AI agent policy input length exceeded');
    }
    if (!input.trim() || standaloneQuotedLiteral(input)) return ALLOWED;

    if (mode === 'python-repl') return inspectPythonReplInput(input);
    if (mode === 'node-repl') return inspectNodeReplInput(input);
    if (mode === 'bun-repl') return inspectBunReplInput(input);
    if (mode === 'deno-repl') return inspectDenoReplInput(input);
    return blocked('unknown', '<policy-mode>', 'Unknown interactive input policy mode');
  } catch {
    return blocked('unknown', '<policy-error>', 'AI agent interactive policy inspection failed closed');
  }
}

export function evaluateAiAgentInvocation(
  input: string,
  shell?: string,
): AiAgentPolicyDecision {
  try {
    return evaluateInternal(input, 0, inferShellDialect(shell));
  } catch {
    return blocked('unknown', '<policy-error>', 'AI agent policy inspection failed closed');
  }
}
