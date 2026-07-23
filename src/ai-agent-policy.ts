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
const ALLOWED: AiAgentPolicyDecision = { allowed: true };

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

function normalizeExecutableToken(token: string): string {
  const cleaned = removeSimpleShellEscapes(trimTokenPunctuation(token)).replace(/\\/g, '/');
  const baseName = cleaned.split('/').pop() ?? cleaned;
  return baseName.toLowerCase().replace(EXECUTABLE_SUFFIX, '');
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
  return EXECUTABLE_ALIASES.get(normalizeExecutableToken(token));
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

function firstNonOptionIndex(tokens: string[], start = 0): number {
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index] === '--') return index + 1;
    if (!tokens[index].startsWith('-')) return index;
  }
  return -1;
}

function inspectTargetToken(token: string, reason: string): AiAgentPolicyDecision {
  const agent = agentFromPackage(token) ?? agentFromExecutable(token);
  return agent ? blocked(agent, token, reason) : ALLOWED;
}

function inspectLauncherArguments(
  tokens: string[],
  reason: string,
  depth: number,
): AiAgentPolicyDecision {
  const packageOptions = new Set(['-p', '--package']);
  const commandOptions = new Set(['--call', '-c']);
  const executableOptions = new Set(['--shell']);
  const ignoredValueOptions = new Set(['--node-options', '--cache']);
  const optionsWithValues = new Set([
    ...packageOptions,
    ...commandOptions,
    ...executableOptions,
    ...ignoredValueOptions,
  ]);

  const inspectOptionValue = (option: string, value: string): AiAgentPolicyDecision => {
    if (commandOptions.has(option)) {
      return evaluateInternal(value, depth + 1);
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
    const moduleIndex = tokens.findIndex((token, index) => index > 0 && token === '-m');
    if (moduleIndex >= 0 && moduleIndex + 1 < tokens.length) {
      const moduleName = tokens[moduleIndex + 1].split('.')[0].replace(/_/g, '-');
      return inspectTargetToken(moduleName, 'blocked AI agent Python module');
    }
  }

  let index = firstNonOptionIndex(tokens, 1);
  if (index < 0) return ALLOWED;
  if ((runtime === 'deno' || runtime === 'bun') && tokens[index].toLowerCase() === 'run') {
    index = firstNonOptionIndex(tokens, index + 1);
  }
  if (index < 0) return ALLOWED;
  return inspectTargetToken(tokens[index], 'blocked AI agent script runtime target');
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

function inspectPrefixWrapper(tokens: string[], depth: number): AiAgentPolicyDecision {
  const command = normalizeExecutableToken(tokens[0]);
  let index = 1;

  if (command === 'env') {
    const commandStringOptions = new Set(['-S', '--split-string']);
    for (let optionIndex = 1; optionIndex < tokens.length; optionIndex += 1) {
      const match = readOptionValue(tokens, optionIndex, commandStringOptions);
      if (!match) continue;
      const decision = evaluateInternal(match.value, depth + 1);
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
  return evaluateInternal(tokens.slice(index).join(' '), depth + 1);
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

function inspectSegment(segment: string, depth: number): AiAgentPolicyDecision {
  let tokens = tokenize(segment);
  while (tokens.length > 0 && ENV_ASSIGNMENT.test(tokens[0])) tokens = tokens.slice(1);
  while (tokens[0] === '&' || tokens[0] === '.') tokens = tokens.slice(1);
  if (tokens.length === 0) return ALLOWED;

  const directAgent = agentFromExecutable(tokens[0]);
  if (directAgent) {
    return blocked(directAgent, tokens[0], 'blocked AI agent executable');
  }

  const command = normalizeExecutableToken(tokens[0]);

  if (command === 'cmd') {
    const switchIndex = tokens.findIndex((token) => ['/c', '/k'].includes(token.toLowerCase()));
    if (switchIndex >= 0 && switchIndex + 1 < tokens.length) {
      return evaluateInternal(tokens.slice(switchIndex + 1).join(' '), depth + 1);
    }
  }

  if (command === 'powershell' || command === 'pwsh') {
    for (let index = 1; index < tokens.length; index += 1) {
      const option = normalizePowerShellOption(tokens[index]);
      if (matchesPowerShellOption(option, ['-encodedcommand'], ['-enc'])) {
        const decoded = index + 1 < tokens.length ? decodePowerShellCommand(tokens[index + 1]) : null;
        return decoded
          ? evaluateInternal(decoded, depth + 1)
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
        return evaluateInternal(tokens.slice(index + 1).join(' '), depth + 1);
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
      return evaluateInternal(tokens.slice(commandIndex + 1).join(' '), depth + 1);
    }
  }

  if (command === 'invoke-expression' || command === 'iex') {
    return tokens.length > 1 ? evaluateInternal(tokens.slice(1).join(' '), depth + 1) : ALLOWED;
  }

  if (command === 'start-process' || command === 'saps') {
    return inspectStartProcess(tokens);
  }

  if (command === 'call') {
    return tokens.length > 1 ? evaluateInternal(tokens.slice(1).join(' '), depth + 1) : ALLOWED;
  }

  if (command === 'start') {
    if (tokens[1]?.startsWith('-')) {
      return inspectStartProcess(tokens);
    }
    let index = 1;
    while (index < tokens.length && (tokens[index] === '' || tokens[index].startsWith('/'))) index += 1;
    return index < tokens.length ? evaluateInternal(tokens.slice(index).join(' '), depth + 1) : ALLOWED;
  }

  if (command === 'wsl') {
    const index = findDelegatedCommandIndex(
      tokens,
      1,
      new Set(['-d', '--distribution', '-u', '--user', '--cd', '--shell-type']),
      new Set(['-e', '--exec']),
    );
    return index >= 0 && index < tokens.length
      ? evaluateInternal(tokens.slice(index).join(' '), depth + 1)
      : ALLOWED;
  }

  if (command === 'corepack') {
    const index = firstNonOptionIndex(tokens, 1);
    if (index < 0) return ALLOWED;
    const delegated = tokens.slice(index);
    delegated[0] = normalizePackageToken(delegated[0]);
    return evaluateInternal(delegated.join(' '), depth + 1);
  }

  if (
    [
      'sudo', 'doas', 'env', 'command', 'exec', 'nohup', 'setsid',
      'runas', 'xargs', 'time', 'nice', 'timeout',
    ].includes(command)
  ) {
    return inspectPrefixWrapper(tokens, depth);
  }

  if (command === 'npx' || command === 'bunx' || command === 'uvx') {
    return inspectLauncherArguments(tokens.slice(1), `blocked AI agent ${command} target`, depth);
  }

  if (command === 'npm' && ['exec', 'x'].includes(tokens[1]?.toLowerCase())) {
    return inspectLauncherArguments(tokens.slice(2), 'blocked AI agent npm exec target', depth);
  }

  if ((command === 'pnpm' || command === 'yarn') && tokens[1]?.toLowerCase() === 'dlx') {
    return inspectLauncherArguments(tokens.slice(2), `blocked AI agent ${command} dlx target`, depth);
  }

  if (command === 'pipx' && tokens[1]?.toLowerCase() === 'run') {
    return inspectLauncherArguments(tokens.slice(2), 'blocked AI agent pipx target', depth);
  }

  if (['node', 'nodejs', 'python', 'python3', 'py', 'bun', 'deno'].includes(command)) {
    return inspectRuntime(tokens, command);
  }

  return ALLOWED;
}

function evaluateInternal(input: string, depth: number): AiAgentPolicyDecision {
  if (!input.trim()) return ALLOWED;
  if (depth > MAX_WRAPPER_DEPTH) {
    return blocked('unknown', '<wrapper-depth>', 'AI agent policy wrapper depth exceeded');
  }

  for (const substitution of extractCommandSubstitutions(input)) {
    const decision = evaluateInternal(substitution, depth + 1);
    if (!decision.allowed) return decision;
  }

  for (const segment of splitShellSegments(input)) {
    const decision = inspectSegment(segment, depth);
    if (!decision.allowed) return decision;
  }

  return ALLOWED;
}

export function evaluateAiAgentInvocation(input: string): AiAgentPolicyDecision {
  try {
    return evaluateInternal(input, 0);
  } catch {
    return blocked('unknown', '<policy-error>', 'AI agent policy inspection failed closed');
  }
}
