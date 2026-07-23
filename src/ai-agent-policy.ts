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

function normalizeExecutableToken(token: string): string {
  const cleaned = trimTokenPunctuation(token).replace(/\\/g, '/');
  const baseName = cleaned.split('/').pop() ?? cleaned;
  return baseName.toLowerCase().replace(EXECUTABLE_SUFFIX, '');
}

function normalizePackageToken(token: string): string {
  let cleaned = trimTokenPunctuation(token).toLowerCase();
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
    if (!tokens[index].startsWith('-') && !tokens[index].startsWith('/')) return index;
  }
  return -1;
}

function inspectTargetToken(token: string, reason: string): AiAgentPolicyDecision {
  const agent = agentFromPackage(token) ?? agentFromExecutable(token);
  return agent ? blocked(agent, token, reason) : ALLOWED;
}

function inspectLauncherArguments(tokens: string[], reason: string): AiAgentPolicyDecision {
  const optionsWithValues = new Set([
    '-p',
    '--package',
    '--call',
    '-c',
    '--shell',
    '--node-options',
    '--cache',
  ]);

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
        const decision = inspectTargetToken(value, reason);
        if (!decision.allowed) return decision;
        continue;
      }
    }

    if (optionsWithValues.has(lower)) {
      if (index + 1 < tokens.length) {
        const decision = inspectTargetToken(tokens[index + 1], reason);
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
    const bytes = Buffer.from(stripOuterQuotes(encoded), 'base64');
    if (bytes.length === 0) return null;
    const utf16 = bytes.toString('utf16le').replace(/\u0000/g, '').trim();
    if (utf16) return utf16;
    const utf8 = bytes.toString('utf8').replace(/\u0000/g, '').trim();
    return utf8 || null;
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

function inspectPrefixWrapper(tokens: string[], depth: number): AiAgentPolicyDecision {
  let index = 1;
  const command = normalizeExecutableToken(tokens[0]);

  if (command === 'env') {
    while (index < tokens.length && (tokens[index].startsWith('-') || ENV_ASSIGNMENT.test(tokens[index]))) {
      index += 1;
    }
  } else if (command === 'sudo' || command === 'doas') {
    const optionsWithValues = new Set(['-u', '--user', '-g', '--group', '-h', '--host', '-p', '--prompt']);
    while (index < tokens.length) {
      const token = tokens[index].toLowerCase();
      if (optionsWithValues.has(token)) {
        index += 2;
        continue;
      }
      if (token.startsWith('-')) {
        index += 1;
        continue;
      }
      break;
    }
  } else if (command === 'runas') {
    while (index < tokens.length && tokens[index].startsWith('/')) index += 1;
  } else if (command === 'xargs') {
    while (index < tokens.length && tokens[index].startsWith('-')) index += 1;
  }

  if (index >= tokens.length) return ALLOWED;
  return evaluateInternal(tokens.slice(index).join(' '), depth + 1);
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
      const option = tokens[index].toLowerCase();
      if (['-encodedcommand', '-enc'].includes(option)) {
        const decoded = index + 1 < tokens.length ? decodePowerShellCommand(tokens[index + 1]) : null;
        return decoded
          ? evaluateInternal(decoded, depth + 1)
          : blocked('unknown', tokens[index], 'uninspectable PowerShell encoded command');
      }
      if (['-command', '-c'].includes(option) && index + 1 < tokens.length) {
        return evaluateInternal(tokens.slice(index + 1).join(' '), depth + 1);
      }
      if (['-file', '-f'].includes(option) && index + 1 < tokens.length) {
        return inspectTargetToken(tokens[index + 1], 'blocked AI agent PowerShell file target');
      }
    }
  }

  if (['bash', 'sh', 'zsh', 'fish'].includes(command)) {
    const commandIndex = tokens.findIndex(
      (token, index) => index > 0 && token.startsWith('-') && token.toLowerCase().includes('c'),
    );
    if (commandIndex >= 0 && commandIndex + 1 < tokens.length) {
      return evaluateInternal(tokens.slice(commandIndex + 1).join(' '), depth + 1);
    }
  }

  if (command === 'invoke-expression' || command === 'iex') {
    return tokens.length > 1 ? evaluateInternal(tokens.slice(1).join(' '), depth + 1) : ALLOWED;
  }

  if (command === 'start-process') {
    const filePathIndex = tokens.findIndex((token) => token.toLowerCase() === '-filepath');
    if (filePathIndex >= 0 && filePathIndex + 1 < tokens.length) {
      return inspectTargetToken(tokens[filePathIndex + 1], 'blocked AI agent Start-Process target');
    }
    const targetIndex = firstNonOptionIndex(tokens, 1);
    return targetIndex >= 0
      ? inspectTargetToken(tokens[targetIndex], 'blocked AI agent Start-Process target')
      : ALLOWED;
  }

  if (command === 'call') {
    return tokens.length > 1 ? evaluateInternal(tokens.slice(1).join(' '), depth + 1) : ALLOWED;
  }

  if (command === 'start') {
    let index = 1;
    while (index < tokens.length && (tokens[index] === '' || tokens[index].startsWith('/'))) index += 1;
    return index < tokens.length ? evaluateInternal(tokens.slice(index).join(' '), depth + 1) : ALLOWED;
  }

  if (command === 'wsl') {
    const index = firstNonOptionIndex(tokens, 1);
    return index >= 0 ? evaluateInternal(tokens.slice(index).join(' '), depth + 1) : ALLOWED;
  }

  if (['sudo', 'doas', 'env', 'command', 'nohup', 'setsid', 'runas', 'xargs'].includes(command)) {
    return inspectPrefixWrapper(tokens, depth);
  }

  if (command === 'npx' || command === 'bunx' || command === 'uvx') {
    return inspectLauncherArguments(tokens.slice(1), `blocked AI agent ${command} target`);
  }

  if (command === 'npm' && ['exec', 'x'].includes(tokens[1]?.toLowerCase())) {
    return inspectLauncherArguments(tokens.slice(2), 'blocked AI agent npm exec target');
  }

  if ((command === 'pnpm' || command === 'yarn') && tokens[1]?.toLowerCase() === 'dlx') {
    return inspectLauncherArguments(tokens.slice(2), `blocked AI agent ${command} dlx target`);
  }

  if (command === 'pipx' && tokens[1]?.toLowerCase() === 'run') {
    return inspectLauncherArguments(tokens.slice(2), 'blocked AI agent pipx target');
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
