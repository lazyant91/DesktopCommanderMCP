import type {
  AiAgentInteractiveAliasKind,
  AiAgentInteractivePolicyState,
  InteractiveInputPolicyMode,
} from './types.js';

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
      const inlineCode = readOptionValue(tokens, index, new Set(['-c']));
      if (inlineCode) {
        return evaluateAiAgentInteractiveInput(inlineCode.value, 'python-repl');
      }
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
    for (let index = 1; index < tokens.length; index += 1) {
      const inlineCode = readOptionValue(
        tokens,
        index,
        new Set(['-e', '--eval', '-p', '--print']),
      );
      if (inlineCode) {
        return evaluateAiAgentInteractiveInput(inlineCode.value, 'node-repl');
      }
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
    for (let optionIndex = 1; optionIndex < tokens.length; optionIndex += 1) {
      const inlineCode = readOptionValue(
        tokens,
        optionIndex,
        new Set(['-e', '--eval', '-p', '--print']),
      );
      if (inlineCode) {
        return evaluateAiAgentInteractiveInput(inlineCode.value, 'bun-repl');
      }
    }

    let index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set([
        '--cwd', '--config', '--env-file', '--preload', '-r', '--conditions',
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
        '--lock', '--vendor',
      ]),
    );
    if (subcommandIndex < 0) return ALLOWED;
    const subcommand = tokens[subcommandIndex]?.toLowerCase();
    if (subcommand === 'eval') {
      const codeIndex = findDelegatedCommandIndex(
        tokens,
        subcommandIndex + 1,
        new Set(['--ext', '--config', '--import-map', '--location', '--seed', '--v8-flags']),
      );
      return codeIndex >= 0 && codeIndex < tokens.length
        ? evaluateAiAgentInteractiveInput(tokens[codeIndex], 'deno-repl')
        : ALLOWED;
    }
    if (subcommand !== 'run') return ALLOWED;

    const scriptIndex = findDelegatedCommandIndex(
      tokens,
      subcommandIndex + 1,
      new Set([
        '--config', '--import-map', '--cert', '--location', '--seed', '--v8-flags',
        '--lock', '--watch-exclude',
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
        '--location',
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
  } else if (
    index + 3 < tokens.length &&
    ['equ', 'neq', 'lss', 'leq', 'gtr', 'geq'].includes(tokens[index + 1]?.toLowerCase())
  ) {
    index += 3;
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
  if (dialect === 'cmd' && tokens[0].startsWith('@')) {
    tokens[0] = tokens[0].replace(/^@+/, '');
    if (!tokens[0]) tokens = tokens.slice(1);
  }
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

function maskShellQuotedText(input: string): string {
  let quote: '"' | "'" | null = null;
  let masked = '';

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      masked += /[\r\n]/.test(char) ? char : ' ';
      if (char === quote && input[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      masked += ' ';
      continue;
    }
    masked += char;
  }
  return masked;
}

function extractPosixCaseBodies(input: string): string[] {
  const bodies: string[] = [];
  const masked = maskShellQuotedText(input);
  const headerPattern = /\bcase\b[\s\S]*?\bin\b/gi;
  let header: RegExpExecArray | null;

  while ((header = headerPattern.exec(masked))) {
    const branchStart = headerPattern.lastIndex;
    const esacPattern = /\besac\b/gi;
    esacPattern.lastIndex = branchStart;
    const esac = esacPattern.exec(masked);
    if (!esac) break;

    const maskedBranches = masked.slice(branchStart, esac.index);
    const originalBranches = input.slice(branchStart, esac.index);
    let cursor = 0;
    while (cursor < maskedBranches.length) {
      const closeParen = maskedBranches.indexOf(')', cursor);
      if (closeParen < 0) break;
      const terminator = maskedBranches.indexOf(';;', closeParen + 1);
      const body = originalBranches
        .slice(closeParen + 1, terminator >= 0 ? terminator : maskedBranches.length)
        .trim();
      if (body) bodies.push(body);
      if (terminator < 0) break;
      cursor = terminator + 2;
    }
    headerPattern.lastIndex = esac.index + esac[0].length;
  }

  return bodies;
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

  if (dialect === 'posix') {
    for (const body of extractPosixCaseBodies(input)) {
      const decision = evaluateInternal(body, depth + 1, dialect);
      if (!decision.allowed) return decision;
    }
  }

  for (const segment of splitShellSegments(input)) {
    const decision = inspectSegment(segment, depth, dialect);
    if (!decision.allowed) return decision;
  }

  return ALLOWED;
}

type InteractiveCodeToken = {
  type: 'identifier' | 'string' | 'punctuation';
  value: string;
};

export interface AiAgentInteractiveEvaluation {
  decision: AiAgentPolicyDecision;
  nextState: AiAgentInteractivePolicyState;
}

const MAX_INTERACTIVE_POLICY_ALIASES = 64;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const NODE_METHOD_KINDS: Record<string, AiAgentInteractiveAliasKind> = {
  spawn: 'node-spawn',
  spawnsync: 'node-spawn-sync',
  execfile: 'node-exec-file',
  execfilesync: 'node-exec-file-sync',
  fork: 'node-fork',
  exec: 'node-exec',
  execsync: 'node-exec-sync',
};

const PYTHON_SUBPROCESS_METHOD_KINDS: Record<string, AiAgentInteractiveAliasKind> = {
  run: 'python-run',
  popen: 'python-popen',
  call: 'python-call',
  check_call: 'python-check-call',
  check_output: 'python-check-output',
};

const PYTHON_OS_METHOD_KINDS: Record<string, AiAgentInteractiveAliasKind> = {
  system: 'python-system',
  popen: 'python-os-popen',
};

export function createAiAgentInteractivePolicyState(): AiAgentInteractivePolicyState {
  return { aliases: {} };
}

function cloneInteractiveState(
  state?: AiAgentInteractivePolicyState,
): AiAgentInteractivePolicyState {
  return { aliases: { ...(state?.aliases ?? {}) } };
}

function decodeCodeEscape(char: string): string {
  if (char === 'n') return '\n';
  if (char === 'r') return '\r';
  if (char === 't') return '\t';
  return char;
}

function lexInteractiveCode(
  input: string,
  mode: InteractiveInputPolicyMode,
): InteractiveCodeToken[] {
  const tokens: InteractiveCodeToken[] = [];
  const python = mode === 'python-repl';
  let index = 0;

  const readEmbeddedExpression = (
    openBraceIndex: number,
  ): { source: string; endIndex: number } | null => {
    let cursor = openBraceIndex + 1;
    let depth = 1;
    let nestedQuote: string | null = null;

    while (cursor < input.length) {
      const char = input[cursor];
      if (nestedQuote) {
        if (char === '\\') {
          cursor += 2;
          continue;
        }
        if (char === nestedQuote) nestedQuote = null;
        cursor += 1;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        nestedQuote = char;
        cursor += 1;
        continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return {
            source: input.slice(openBraceIndex + 1, cursor),
            endIndex: cursor,
          };
        }
      }
      cursor += 1;
    }
    return null;
  };

  const readString = (
    quote: string,
    triple: boolean,
    interpolate: boolean,
  ): void => {
    const terminator = triple ? quote.repeat(3) : quote;
    index += terminator.length;
    let value = '';
    let hadInterpolation = false;

    while (index < input.length) {
      if (input.startsWith(terminator, index)) {
        index += terminator.length;
        if (!hadInterpolation) tokens.push({ type: 'string', value });
        return;
      }
      const char = input[index];
      const jsInterpolation = quote === '`' && char === '$' && input[index + 1] === '{';
      const pythonInterpolation =
        python && interpolate && char === '{' && input[index + 1] !== '{';
      if (jsInterpolation || pythonInterpolation) {
        const openBraceIndex = jsInterpolation ? index + 1 : index;
        const embedded = readEmbeddedExpression(openBraceIndex);
        if (embedded) {
          tokens.push(...lexInteractiveCode(embedded.source, mode));
          hadInterpolation = true;
          index = embedded.endIndex + 1;
          continue;
        }
      }
      if (python && interpolate && char === '{' && input[index + 1] === '{') {
        value += '{';
        index += 2;
        continue;
      }
      if (python && interpolate && char === '}' && input[index + 1] === '}') {
        value += '}';
        index += 2;
        continue;
      }
      if (char === '\\' && index + 1 < input.length) {
        value += decodeCodeEscape(input[index + 1]);
        index += 2;
        continue;
      }
      value += char;
      index += 1;
    }

    tokens.push({ type: 'string', value: '<unterminated-string>' });
  };

  const canStartRegexLiteral = (): boolean => {
    const previous = tokens[tokens.length - 1];
    if (!previous) return true;
    if (
      previous.type === 'punctuation' &&
      ['=', '(', '[', '{', ',', ':', ';', '!', '?', '>', '&', '|', '+', '-', '*', '%', '~', '^'].includes(previous.value)
    ) {
      return true;
    }
    return previous.type === 'identifier' &&
      ['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'yield', 'await'].includes(
        previous.value,
      );
  };

  const readRegexLiteral = (): void => {
    index += 1;
    let inCharacterClass = false;
    while (index < input.length) {
      const char = input[index];
      if (char === '\\') {
        index += 2;
        continue;
      }
      if (char === '[') inCharacterClass = true;
      if (char === ']') inCharacterClass = false;
      if (char === '/' && !inCharacterClass) {
        index += 1;
        while (index < input.length && /[A-Za-z]/.test(input[index])) index += 1;
        tokens.push({ type: 'string', value: '<regex-literal>' });
        return;
      }
      if (char === '\n' || char === '\r') break;
      index += 1;
    }
    tokens.push({ type: 'punctuation', value: '/' });
  };

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (python && char === '#') {
      while (index < input.length && input[index] !== '\n') index += 1;
      continue;
    }
    if (!python && input.startsWith('//', index)) {
      while (index < input.length && input[index] !== '\n') index += 1;
      continue;
    }
    if (!python && input.startsWith('/*', index)) {
      const end = input.indexOf('*/', index + 2);
      index = end >= 0 ? end + 2 : input.length;
      continue;
    }
    if (!python && char === '/' && canStartRegexLiteral()) {
      readRegexLiteral();
      continue;
    }

    if (char === '"' || char === "'" || (!python && char === '`')) {
      const triple = python && input.startsWith(char.repeat(3), index);
      readString(char, triple, !python && char === '`');
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      const start = index;
      index += 1;
      while (index < input.length && /[A-Za-z0-9_$]/.test(input[index])) index += 1;
      const identifier = input.slice(start, index);
      if (
        python &&
        /^[rubf]+$/i.test(identifier) &&
        (input[index] === '"' || input[index] === "'")
      ) {
        const quote = input[index];
        const triple = input.startsWith(quote.repeat(3), index);
        readString(quote, triple, identifier.toLowerCase().includes('f'));
      } else {
        tokens.push({ type: 'identifier', value: identifier });
      }
      continue;
    }

    tokens.push({ type: 'punctuation', value: char });
    index += 1;
  }

  return normalizeStaticMemberAccess(tokens);
}

function normalizeStaticMemberAccess(
  tokens: InteractiveCodeToken[],
): InteractiveCodeToken[] {
  const normalized: InteractiveCodeToken[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const previous = normalized[normalized.length - 1];
    const property = tokens[index + 1];
    const close = tokens[index + 2];
    const memberReceiver =
      previous?.type === 'identifier' ||
      (previous?.type === 'punctuation' && [')', ']'].includes(previous.value));

    if (
      memberReceiver &&
      isToken(token, 'punctuation', '[') &&
      property?.type === 'string' &&
      IDENTIFIER_PATTERN.test(property.value) &&
      isToken(close, 'punctuation', ']')
    ) {
      normalized.push(
        { type: 'punctuation', value: '.' },
        { type: 'identifier', value: property.value },
      );
      index += 2;
      continue;
    }
    normalized.push(token);
  }

  return normalized;
}

function isToken(
  token: InteractiveCodeToken | undefined,
  type: InteractiveCodeToken['type'],
  value?: string,
): boolean {
  return Boolean(token && token.type === type && (value === undefined || token.value === value));
}

function findMatchingCodeToken(
  tokens: InteractiveCodeToken[],
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (isToken(tokens[index], 'punctuation', open)) depth += 1;
    if (isToken(tokens[index], 'punctuation', close)) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitCodeArguments(
  tokens: InteractiveCodeToken[],
  openParenIndex: number,
): { args: InteractiveCodeToken[][]; closeParenIndex: number } | null {
  const closeParenIndex = findMatchingCodeToken(tokens, openParenIndex, '(', ')');
  if (closeParenIndex < 0) return null;

  const args: InteractiveCodeToken[][] = [];
  let current: InteractiveCodeToken[] = [];
  let parens = 0;
  let brackets = 0;
  let braces = 0;

  for (let index = openParenIndex + 1; index < closeParenIndex; index += 1) {
    const token = tokens[index];
    if (isToken(token, 'punctuation', '(')) parens += 1;
    if (isToken(token, 'punctuation', ')')) parens -= 1;
    if (isToken(token, 'punctuation', '[')) brackets += 1;
    if (isToken(token, 'punctuation', ']')) brackets -= 1;
    if (isToken(token, 'punctuation', '{')) braces += 1;
    if (isToken(token, 'punctuation', '}')) braces -= 1;

    if (
      isToken(token, 'punctuation', ',') &&
      parens === 0 &&
      brackets === 0 &&
      braces === 0
    ) {
      args.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length > 0) args.push(current);
  return { args, closeParenIndex };
}

function staticCodeString(tokens: InteractiveCodeToken[]): string | null {
  return tokens.length === 1 && tokens[0].type === 'string' && !tokens[0].value.startsWith('<')
    ? tokens[0].value
    : null;
}

function staticCodeArray(
  tokens: InteractiveCodeToken[],
  allowTuple = false,
): string[] | null {
  if (tokens.length < 2) return null;
  const squareArray =
    isToken(tokens[0], 'punctuation', '[') &&
    isToken(tokens[tokens.length - 1], 'punctuation', ']');
  const tuple =
    allowTuple &&
    isToken(tokens[0], 'punctuation', '(') &&
    isToken(tokens[tokens.length - 1], 'punctuation', ')');
  if (!squareArray && !tuple) return null;

  const wrapped = [
    { type: 'punctuation', value: '(' } as InteractiveCodeToken,
    ...tokens.slice(1, -1),
    { type: 'punctuation', value: ')' } as InteractiveCodeToken,
  ];
  const parsed = splitCodeArguments(wrapped, 0);
  if (!parsed) return null;
  if (parsed.args.length === 0) return [];
  const values: string[] = [];
  for (const argument of parsed.args) {
    if (argument.length === 0) continue;
    const value = staticCodeString(argument);
    if (value === null) return null;
    values.push(value);
  }
  return values;
}

function codeKeywordValue(
  argument: InteractiveCodeToken[],
  keyword: string,
): InteractiveCodeToken[] | null {
  return isToken(argument[0], 'identifier', keyword) && isToken(argument[1], 'punctuation', '=')
    ? argument.slice(2)
    : null;
}

function codeObjectProperty(
  tokens: InteractiveCodeToken[],
  propertyName: string,
): InteractiveCodeToken[] | null {
  if (
    tokens.length < 2 ||
    !isToken(tokens[0], 'punctuation', '{') ||
    !isToken(tokens[tokens.length - 1], 'punctuation', '}')
  ) {
    return null;
  }

  const wrapped = [
    { type: 'punctuation', value: '(' } as InteractiveCodeToken,
    ...tokens.slice(1, -1),
    { type: 'punctuation', value: ')' } as InteractiveCodeToken,
  ];
  const parsed = splitCodeArguments(wrapped, 0);
  if (!parsed) return null;

  for (const property of parsed.args) {
    const key = property[0]?.value;
    if (
      key?.toLowerCase() === propertyName.toLowerCase() &&
      isToken(property[1], 'punctuation', ':')
    ) {
      return property.slice(2);
    }
  }
  return null;
}

function staticCodeBoolean(tokens: InteractiveCodeToken[]): boolean | null {
  if (tokens.length !== 1 || tokens[0].type !== 'identifier') return null;
  if (tokens[0].value === 'true') return true;
  if (tokens[0].value === 'false') return false;
  return null;
}

function quoteStaticCommandArgument(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function inspectStaticArgv(argv: string[], reason: string): AiAgentPolicyDecision {
  if (argv.length === 0) return ALLOWED;
  const command = argv.map(quoteStaticCommandArgument).join(' ');
  const decision = evaluateInternal(command, 1, 'generic');
  if (!decision.allowed) return decision;
  return inspectRuntimeTargetToken(argv[0], reason);
}

function setInteractiveAlias(
  state: AiAgentInteractivePolicyState,
  alias: string,
  kind: AiAgentInteractiveAliasKind,
): boolean {
  if (!IDENTIFIER_PATTERN.test(alias) || alias.length > 128) return true;
  if (!(alias in state.aliases) && Object.keys(state.aliases).length >= MAX_INTERACTIVE_POLICY_ALIASES) {
    return false;
  }
  state.aliases[alias] = kind;
  return true;
}

function nodeMethodKind(method: string): AiAgentInteractiveAliasKind | undefined {
  return NODE_METHOD_KINDS[method.toLowerCase()];
}

function pythonSubprocessMethodKind(method: string): AiAgentInteractiveAliasKind | undefined {
  return PYTHON_SUBPROCESS_METHOD_KINDS[method.toLowerCase()];
}

function pythonOsMethodKind(method: string): AiAgentInteractiveAliasKind | undefined {
  return PYTHON_OS_METHOD_KINDS[method.toLowerCase()];
}

function isChildProcessModule(value: string): boolean {
  return value === 'child_process' || value === 'node:child_process';
}

function destructuredNodeAliasKind(
  source: string,
  member: string,
): AiAgentInteractiveAliasKind | undefined {
  if (source === 'Bun') {
    if (member.toLowerCase() === 'spawn') return 'bun-spawn';
    if (member.toLowerCase() === 'spawnsync') return 'bun-spawn-sync';
  }
  if (source === 'Deno' && member === 'Command') return 'deno-command';
  return undefined;
}

function deriveNodeAliases(
  tokens: InteractiveCodeToken[],
  state: AiAgentInteractivePolicyState,
): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      isToken(tokens[index], 'identifier', 'import') &&
      isToken(tokens[index + 1], 'punctuation', '*') &&
      isToken(tokens[index + 2], 'identifier', 'as') &&
      isToken(tokens[index + 3], 'identifier') &&
      isToken(tokens[index + 4], 'identifier', 'from') &&
      isToken(tokens[index + 5], 'string') &&
      isChildProcessModule(tokens[index + 5].value)
    ) {
      if (!setInteractiveAlias(state, tokens[index + 3].value, 'node-child-process-receiver')) return false;
    }

    if (
      isToken(tokens[index], 'identifier', 'import') &&
      isToken(tokens[index + 1], 'punctuation', '{')
    ) {
      const close = findMatchingCodeToken(tokens, index + 1, '{', '}');
      if (
        close > index + 1 &&
        isToken(tokens[close + 1], 'identifier', 'from') &&
        isToken(tokens[close + 2], 'string') &&
        isChildProcessModule(tokens[close + 2].value)
      ) {
        let cursor = index + 2;
        while (cursor < close) {
          if (isToken(tokens[cursor], 'identifier')) {
            const method = tokens[cursor].value;
            const alias =
              isToken(tokens[cursor + 1], 'identifier', 'as') && isToken(tokens[cursor + 2], 'identifier')
                ? tokens[cursor + 2].value
                : method;
            const kind = nodeMethodKind(method);
            if (kind && !setInteractiveAlias(state, alias, kind)) return false;
          }
          cursor += 1;
        }
      }
    }

    const declarationOffset = ['const', 'let', 'var'].includes(tokens[index]?.value) ? 1 : 0;
    const targetIndex = index + declarationOffset;

    if (isToken(tokens[targetIndex], 'punctuation', '{')) {
      const close = findMatchingCodeToken(tokens, targetIndex, '{', '}');
      if (close > targetIndex && isToken(tokens[close + 1], 'punctuation', '=')) {
        const rhs = close + 2;
        const requireClose =
          isToken(tokens[rhs], 'identifier', 'require') &&
          isToken(tokens[rhs + 1], 'punctuation', '(')
            ? findMatchingCodeToken(tokens, rhs + 1, '(', ')')
            : -1;
        const childProcessSource =
          requireClose > rhs + 1 &&
          isToken(tokens[rhs + 2], 'string') &&
          isChildProcessModule(tokens[rhs + 2].value);
        const objectSource = isToken(tokens[rhs], 'identifier')
          ? tokens[rhs].value
          : undefined;

        let cursor = targetIndex + 1;
        while (cursor < close) {
          if (isToken(tokens[cursor], 'identifier')) {
            const member = tokens[cursor].value;
            const alias =
              isToken(tokens[cursor + 1], 'punctuation', ':') &&
              isToken(tokens[cursor + 2], 'identifier')
                ? tokens[cursor + 2].value
                : member;
            const objectSourceKind = objectSource
              ? state.aliases[objectSource]
              : undefined;
            const kind = childProcessSource || objectSourceKind === 'node-child-process-receiver'
              ? nodeMethodKind(member)
              : objectSource
                ? destructuredNodeAliasKind(objectSource, member)
                : undefined;
            if (kind && !setInteractiveAlias(state, alias, kind)) return false;
          }
          cursor += 1;
        }
      }
    }

    if (
      isToken(tokens[targetIndex], 'identifier') &&
      isToken(tokens[targetIndex + 1], 'punctuation', '=')
    ) {
      const alias = tokens[targetIndex].value;
      const rhs = targetIndex + 2;
      let kind: AiAgentInteractiveAliasKind | undefined;

      if (
        isToken(tokens[rhs], 'identifier', 'require') &&
        isToken(tokens[rhs + 1], 'punctuation', '(') &&
        isToken(tokens[rhs + 2], 'string') &&
        isChildProcessModule(tokens[rhs + 2].value)
      ) {
        const requireClose = findMatchingCodeToken(tokens, rhs + 1, '(', ')');
        if (
          requireClose > rhs + 1 &&
          isToken(tokens[requireClose + 1], 'punctuation', '.') &&
          isToken(tokens[requireClose + 2], 'identifier')
        ) {
          kind = nodeMethodKind(tokens[requireClose + 2].value);
        } else {
          kind = 'node-child-process-receiver';
        }
      } else if (
        isToken(tokens[rhs], 'identifier', 'Bun') &&
        isToken(tokens[rhs + 1], 'punctuation', '.') &&
        isToken(tokens[rhs + 2], 'identifier')
      ) {
        kind = destructuredNodeAliasKind('Bun', tokens[rhs + 2].value);
      } else if (
        isToken(tokens[rhs], 'identifier', 'Deno') &&
        isToken(tokens[rhs + 1], 'punctuation', '.') &&
        isToken(tokens[rhs + 2], 'identifier')
      ) {
        kind = destructuredNodeAliasKind('Deno', tokens[rhs + 2].value);
      } else if (
        isToken(tokens[rhs], 'identifier') &&
        isToken(tokens[rhs + 1], 'punctuation', '.') &&
        isToken(tokens[rhs + 2], 'identifier')
      ) {
        const receiverKind = state.aliases[tokens[rhs].value];
        if (receiverKind === 'node-child-process-receiver') {
          kind = nodeMethodKind(tokens[rhs + 2].value);
        }
      } else if (isToken(tokens[rhs], 'identifier')) {
        kind = state.aliases[tokens[rhs].value];
      }

      if (kind) {
        if (!setInteractiveAlias(state, alias, kind)) return false;
      } else if (alias in state.aliases) {
        delete state.aliases[alias];
      }
    }
  }
  return true;
}

function derivePythonAliases(
  tokens: InteractiveCodeToken[],
  state: AiAgentInteractivePolicyState,
): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      isToken(tokens[index], 'identifier', 'import') &&
      isToken(tokens[index + 1], 'identifier')
    ) {
      let cursor = index + 1;
      while (cursor < tokens.length && isToken(tokens[cursor], 'identifier')) {
        const moduleName = tokens[cursor].value;
        cursor += 1;
        const alias =
          isToken(tokens[cursor], 'identifier', 'as') &&
          isToken(tokens[cursor + 1], 'identifier')
            ? tokens[cursor + 1].value
            : moduleName;
        if (alias !== moduleName) cursor += 2;

        const kind = moduleName === 'subprocess'
          ? 'python-subprocess-receiver'
          : moduleName === 'os'
            ? 'python-os-receiver'
            : undefined;
        if (kind && !setInteractiveAlias(state, alias, kind)) return false;
        if (!isToken(tokens[cursor], 'punctuation', ',')) break;
        cursor += 1;
      }
    }

    if (
      isToken(tokens[index], 'identifier', 'from') &&
      isToken(tokens[index + 1], 'identifier') &&
      isToken(tokens[index + 2], 'identifier', 'import')
    ) {
      const moduleName = tokens[index + 1].value;
      let cursor = index + 3;
      const parenthesized = isToken(tokens[cursor], 'punctuation', '(');
      if (parenthesized) cursor += 1;

      while (cursor < tokens.length && isToken(tokens[cursor], 'identifier')) {
        const method = tokens[cursor].value;
        cursor += 1;
        const alias =
          isToken(tokens[cursor], 'identifier', 'as') &&
          isToken(tokens[cursor + 1], 'identifier')
            ? tokens[cursor + 1].value
            : method;
        if (alias !== method) cursor += 2;

        const kind = moduleName === 'subprocess'
          ? pythonSubprocessMethodKind(method)
          : moduleName === 'os'
            ? pythonOsMethodKind(method)
            : undefined;
        if (kind && !setInteractiveAlias(state, alias, kind)) return false;
        if (!isToken(tokens[cursor], 'punctuation', ',')) break;
        cursor += 1;
      }
    }

    if (
      isToken(tokens[index], 'identifier') &&
      isToken(tokens[index + 1], 'punctuation', '=') &&
      tokens[index - 1]?.value !== 'as'
    ) {
      const alias = tokens[index].value;
      const rhs = index + 2;
      let kind: AiAgentInteractiveAliasKind | undefined;

      if (
        isToken(tokens[rhs], 'identifier') &&
        isToken(tokens[rhs + 1], 'punctuation', '.') &&
        isToken(tokens[rhs + 2], 'identifier')
      ) {
        const receiver = tokens[rhs].value;
        const receiverKind = state.aliases[receiver];
        if (receiver === 'subprocess' || receiverKind === 'python-subprocess-receiver') {
          kind = pythonSubprocessMethodKind(tokens[rhs + 2].value);
        } else if (receiver === 'os' || receiverKind === 'python-os-receiver') {
          kind = pythonOsMethodKind(tokens[rhs + 2].value);
        }
      } else if (isToken(tokens[rhs], 'identifier')) {
        kind = state.aliases[tokens[rhs].value];
      }

      if (kind) {
        if (!setInteractiveAlias(state, alias, kind)) return false;
      } else if (alias in state.aliases) {
        delete state.aliases[alias];
      }
    }
  }
  return true;
}

function deriveInteractiveAliases(
  tokens: InteractiveCodeToken[],
  mode: InteractiveInputPolicyMode,
  state: AiAgentInteractivePolicyState,
): boolean {
  if (mode === 'python-repl') return derivePythonAliases(tokens, state);
  if (mode === 'node-repl' || mode === 'bun-repl' || mode === 'deno-repl') {
    return deriveNodeAliases(tokens, state);
  }
  return true;
}

function inspectNodeProcessCall(
  method: string,
  args: InteractiveCodeToken[][],
): AiAgentPolicyDecision {
  const lower = method.toLowerCase();
  const positional = args.filter((argument) => !isToken(argument[1], 'punctuation', '='));
  if (lower === 'exec' || lower === 'execsync') {
    const command = staticCodeString(positional[0] ?? []);
    return command === null ? ALLOWED : evaluateInternal(command, 1, 'generic');
  }

  const target = staticCodeString(positional[0] ?? []);
  if (target === null) return ALLOWED;

  if (lower === 'spawn' || lower === 'spawnsync') {
    for (const optionCandidate of [positional[1], positional[2]]) {
      if (!optionCandidate) continue;
      const shellTokens = codeObjectProperty(optionCandidate, 'shell');
      if (!shellTokens) continue;

      const shellExecutable = staticCodeString(shellTokens);
      if (shellExecutable !== null) {
        const shellDecision = inspectRuntimeTargetToken(
          shellExecutable,
          'blocked AI agent Node REPL shell target',
        );
        if (!shellDecision.allowed) return shellDecision;
        return evaluateInternal(target, 1, inferShellDialect(shellExecutable));
      }

      if (staticCodeBoolean(shellTokens) === true) {
        const defaultDialect: ShellDialect = process.platform === 'win32' ? 'cmd' : 'posix';
        return evaluateInternal(target, 1, defaultDialect);
      }
    }
  }

  const staticArgs = staticCodeArray(positional[1] ?? []) ?? [];
  return inspectStaticArgv(
    [target, ...staticArgs],
    'blocked AI agent Node REPL process target',
  );
}

function inspectPythonProcessCall(
  method: string,
  args: InteractiveCodeToken[][],
): AiAgentPolicyDecision {
  for (const argument of args) {
    const executableTokens = codeKeywordValue(argument, 'executable');
    if (executableTokens) {
      const executable = staticCodeString(executableTokens);
      if (executable !== null) {
        const decision = inspectRuntimeTargetToken(
          executable,
          'blocked AI agent Python REPL executable target',
        );
        if (!decision.allowed) return decision;
      }
    }
  }

  let commandTokens: InteractiveCodeToken[] | undefined;
  for (const argument of args) {
    commandTokens = codeKeywordValue(argument, 'args') ?? commandTokens;
  }
  commandTokens ??= args.find((argument) => !isToken(argument[1], 'punctuation', '='));
  if (!commandTokens) return ALLOWED;

  const argv = staticCodeArray(commandTokens, true);
  if (argv) {
    return inspectStaticArgv(argv, 'blocked AI agent Python REPL process target');
  }
  const command = staticCodeString(commandTokens);
  if (command !== null) return evaluateInternal(command, 1, 'generic');
  return ALLOWED;
}

function inspectBunProcessCall(args: InteractiveCodeToken[][]): AiAgentPolicyDecision {
  const first = args[0] ?? [];
  const arrayCommand = staticCodeArray(first);
  if (arrayCommand) {
    return inspectStaticArgv(arrayCommand, 'blocked AI agent Bun REPL process target');
  }
  const objectCommand = codeObjectProperty(first, 'cmd');
  const objectArgv = objectCommand ? staticCodeArray(objectCommand) : null;
  if (objectArgv) {
    return inspectStaticArgv(objectArgv, 'blocked AI agent Bun REPL process target');
  }
  const target = staticCodeString(first);
  if (target !== null) {
    const staticArgs = staticCodeArray(args[1] ?? []) ?? [];
    return inspectStaticArgv(
      [target, ...staticArgs],
      'blocked AI agent Bun REPL process target',
    );
  }
  return ALLOWED;
}

function inspectDenoCommandCall(args: InteractiveCodeToken[][]): AiAgentPolicyDecision {
  const target = staticCodeString(args[0] ?? []);
  if (target === null) return ALLOWED;
  const argsProperty = codeObjectProperty(args[1] ?? [], 'args');
  const staticArgs = argsProperty ? staticCodeArray(argsProperty) ?? [] : [];
  return inspectStaticArgv(
    [target, ...staticArgs],
    'blocked AI agent Deno REPL process target',
  );
}

function aliasMethod(kind: AiAgentInteractiveAliasKind): string | null {
  const mapping: Partial<Record<AiAgentInteractiveAliasKind, string>> = {
    'node-spawn': 'spawn',
    'node-spawn-sync': 'spawnsync',
    'node-exec-file': 'execfile',
    'node-exec-file-sync': 'execfilesync',
    'node-fork': 'fork',
    'node-exec': 'exec',
    'node-exec-sync': 'execsync',
    'python-run': 'run',
    'python-popen': 'popen',
    'python-call': 'call',
    'python-check-call': 'check_call',
    'python-check-output': 'check_output',
    'python-system': 'system',
    'python-os-popen': 'popen',
    'bun-spawn': 'spawn',
    'bun-spawn-sync': 'spawnsync',
  };
  return mapping[kind] ?? null;
}

function inspectNodeInteractiveTokens(
  tokens: InteractiveCodeToken[],
  state: AiAgentInteractivePolicyState,
): AiAgentPolicyDecision {
  for (let index = 0; index < tokens.length; index += 1) {
    let method: string | null = null;
    let openParen = -1;

    if (
      isToken(tokens[index], 'identifier', 'require') &&
      isToken(tokens[index + 1], 'punctuation', '(') &&
      isToken(tokens[index + 2], 'string') &&
      isChildProcessModule(tokens[index + 2].value)
    ) {
      const requireClose = findMatchingCodeToken(tokens, index + 1, '(', ')');
      if (
        requireClose > index + 1 &&
        isToken(tokens[requireClose + 1], 'punctuation', '.') &&
        isToken(tokens[requireClose + 2], 'identifier') &&
        isToken(tokens[requireClose + 3], 'punctuation', '(')
      ) {
        method = tokens[requireClose + 2].value;
        openParen = requireClose + 3;
      }
    } else if (
      isToken(tokens[index], 'identifier') &&
      isToken(tokens[index + 1], 'punctuation', '.') &&
      isToken(tokens[index + 2], 'identifier') &&
      isToken(tokens[index + 3], 'punctuation', '(')
    ) {
      const receiver = tokens[index].value;
      const receiverKind = state.aliases[receiver];
      if (receiver === 'child_process' || receiverKind === 'node-child-process-receiver') {
        method = tokens[index + 2].value;
        openParen = index + 3;
      }
    } else if (
      isToken(tokens[index], 'identifier') &&
      isToken(tokens[index + 1], 'punctuation', '(')
    ) {
      const kind = state.aliases[tokens[index].value];
      if (kind?.startsWith('node-') && kind !== 'node-child-process-receiver') {
        method = aliasMethod(kind);
        openParen = index + 1;
      }
    }

    if (method && nodeMethodKind(method)) {
      const parsed = splitCodeArguments(tokens, openParen);
      if (!parsed) continue;
      const decision = inspectNodeProcessCall(method, parsed.args);
      if (!decision.allowed) return decision;
      index = parsed.closeParenIndex;
    }
  }
  return ALLOWED;
}

function inspectPythonInteractiveTokens(
  tokens: InteractiveCodeToken[],
  state: AiAgentInteractivePolicyState,
): AiAgentPolicyDecision {
  for (let index = 0; index < tokens.length; index += 1) {
    let method: string | null = null;
    let openParen = -1;
    let osMethod = false;

    if (
      isToken(tokens[index], 'identifier', '__import__') &&
      isToken(tokens[index + 1], 'punctuation', '(') &&
      isToken(tokens[index + 2], 'string')
    ) {
      const importClose = findMatchingCodeToken(tokens, index + 1, '(', ')');
      if (
        importClose > index + 1 &&
        isToken(tokens[importClose + 1], 'punctuation', '.') &&
        isToken(tokens[importClose + 2], 'identifier') &&
        isToken(tokens[importClose + 3], 'punctuation', '(')
      ) {
        method = tokens[importClose + 2].value;
        openParen = importClose + 3;
        osMethod = tokens[index + 2].value === 'os';
      }
    } else if (
      isToken(tokens[index], 'identifier') &&
      isToken(tokens[index + 1], 'punctuation', '.') &&
      isToken(tokens[index + 2], 'identifier') &&
      isToken(tokens[index + 3], 'punctuation', '(')
    ) {
      const receiver = tokens[index].value;
      const receiverKind = state.aliases[receiver];
      if (receiver === 'subprocess' || receiverKind === 'python-subprocess-receiver') {
        method = tokens[index + 2].value;
        openParen = index + 3;
      } else if (receiver === 'os' || receiverKind === 'python-os-receiver') {
        method = tokens[index + 2].value;
        openParen = index + 3;
        osMethod = true;
      }
    } else if (
      isToken(tokens[index], 'identifier') &&
      isToken(tokens[index + 1], 'punctuation', '(')
    ) {
      const kind = state.aliases[tokens[index].value];
      const mappedMethod = kind ? aliasMethod(kind) : null;
      if (mappedMethod && kind?.startsWith('python-')) {
        method = mappedMethod;
        openParen = index + 1;
        osMethod = kind === 'python-system' || kind === 'python-os-popen';
      }
    }

    if (!method) continue;
    const methodKnown = osMethod
      ? pythonOsMethodKind(method)
      : pythonSubprocessMethodKind(method);
    if (!methodKnown) continue;
    const parsed = splitCodeArguments(tokens, openParen);
    if (!parsed) continue;
    const decision = osMethod
      ? (() => {
          const command = staticCodeString(parsed.args[0] ?? []);
          return command === null ? ALLOWED : evaluateInternal(command, 1, 'generic');
        })()
      : inspectPythonProcessCall(method, parsed.args);
    if (!decision.allowed) return decision;
    index = parsed.closeParenIndex;
  }
  return ALLOWED;
}

function inspectBunInteractiveTokens(
  tokens: InteractiveCodeToken[],
  state: AiAgentInteractivePolicyState,
): AiAgentPolicyDecision {
  const nodeDecision = inspectNodeInteractiveTokens(tokens, state);
  if (!nodeDecision.allowed) return nodeDecision;

  for (let index = 0; index < tokens.length; index += 1) {
    let openParen = -1;
    if (
      isToken(tokens[index], 'identifier', 'Bun') &&
      isToken(tokens[index + 1], 'punctuation', '.') &&
      isToken(tokens[index + 2], 'identifier') &&
      ['spawn', 'spawnsync'].includes(tokens[index + 2].value.toLowerCase()) &&
      isToken(tokens[index + 3], 'punctuation', '(')
    ) {
      openParen = index + 3;
    } else if (
      isToken(tokens[index], 'identifier') &&
      isToken(tokens[index + 1], 'punctuation', '(') &&
      ['bun-spawn', 'bun-spawn-sync'].includes(state.aliases[tokens[index].value] ?? '')
    ) {
      openParen = index + 1;
    }
    if (openParen < 0) continue;
    const parsed = splitCodeArguments(tokens, openParen);
    if (!parsed) continue;
    const decision = inspectBunProcessCall(parsed.args);
    if (!decision.allowed) return decision;
    index = parsed.closeParenIndex;
  }
  return ALLOWED;
}

function inspectDenoInteractiveTokens(
  tokens: InteractiveCodeToken[],
  state: AiAgentInteractivePolicyState,
): AiAgentPolicyDecision {
  const nodeDecision = inspectNodeInteractiveTokens(tokens, state);
  if (!nodeDecision.allowed) return nodeDecision;

  for (let index = 0; index < tokens.length; index += 1) {
    let openParen = -1;
    if (
      isToken(tokens[index], 'identifier', 'new') &&
      isToken(tokens[index + 1], 'identifier', 'Deno') &&
      isToken(tokens[index + 2], 'punctuation', '.') &&
      isToken(tokens[index + 3], 'identifier', 'Command') &&
      isToken(tokens[index + 4], 'punctuation', '(')
    ) {
      openParen = index + 4;
    } else if (
      isToken(tokens[index], 'identifier', 'new') &&
      isToken(tokens[index + 1], 'identifier') &&
      state.aliases[tokens[index + 1].value] === 'deno-command' &&
      isToken(tokens[index + 2], 'punctuation', '(')
    ) {
      openParen = index + 2;
    }
    if (openParen < 0) continue;
    const parsed = splitCodeArguments(tokens, openParen);
    if (!parsed) continue;
    const decision = inspectDenoCommandCall(parsed.args);
    if (!decision.allowed) return decision;
    index = parsed.closeParenIndex;
  }
  return ALLOWED;
}

function inspectInteractiveTokens(
  tokens: InteractiveCodeToken[],
  mode: InteractiveInputPolicyMode,
  state: AiAgentInteractivePolicyState,
): AiAgentPolicyDecision {
  if (mode === 'python-repl') return inspectPythonInteractiveTokens(tokens, state);
  if (mode === 'node-repl') return inspectNodeInteractiveTokens(tokens, state);
  if (mode === 'bun-repl') return inspectBunInteractiveTokens(tokens, state);
  if (mode === 'deno-repl') return inspectDenoInteractiveTokens(tokens, state);
  return ALLOWED;
}

export function evaluateAiAgentInteractiveInputWithState(
  input: string,
  mode: InteractiveInputPolicyMode,
  state: AiAgentInteractivePolicyState = createAiAgentInteractivePolicyState(),
): AiAgentInteractiveEvaluation {
  const nextState = cloneInteractiveState(state);
  try {
    if (mode === 'command') {
      return { decision: evaluateInternal(input, 0, 'generic'), nextState };
    }
    if (mode === 'cmd-shell') {
      return { decision: evaluateInternal(input, 0, 'cmd'), nextState };
    }
    if (mode === 'powershell-shell') {
      return { decision: evaluateInternal(input, 0, 'powershell'), nextState };
    }
    if (mode === 'posix-shell') {
      return { decision: evaluateInternal(input, 0, 'posix'), nextState };
    }
    if (input.length > MAX_AI_AGENT_POLICY_INPUT_LENGTH) {
      return {
        decision: blocked('unknown', '<input-length>', 'AI agent policy input length exceeded'),
        nextState,
      };
    }
    if (!input.trim()) return { decision: ALLOWED, nextState };

    const tokens = lexInteractiveCode(input, mode);
    if (!deriveInteractiveAliases(tokens, mode, nextState)) {
      return {
        decision: blocked('unknown', '<alias-state>', 'AI agent interactive alias state limit exceeded'),
        nextState: cloneInteractiveState(state),
      };
    }
    return { decision: inspectInteractiveTokens(tokens, mode, nextState), nextState };
  } catch {
    return {
      decision: blocked('unknown', '<policy-error>', 'AI agent interactive policy inspection failed closed'),
      nextState: cloneInteractiveState(state),
    };
  }
}

export function evaluateAiAgentInteractiveInput(
  input: string,
  mode: InteractiveInputPolicyMode,
): AiAgentPolicyDecision {
  return evaluateAiAgentInteractiveInputWithState(input, mode).decision;
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
