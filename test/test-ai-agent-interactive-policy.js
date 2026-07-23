import assert from 'node:assert/strict';

import {
  evaluateAiAgentInteractiveInput,
  MAX_AI_AGENT_POLICY_INPUT_LENGTH,
} from '../dist/ai-agent-policy.js';

const blocked = [
  ['node-repl', "require('node:child_process').spawn('codex', ['exec'])", 'codex'],
  ['node-repl', "require('child_process').exec('claude -p review')", 'claude'],
  ['node-repl', "const cp = require('node:child_process'); cp.execFile('gemini', [])", 'gemini'],
  ['node-repl', "import * as cp from 'node:child_process'; cp.spawnSync('aider', [])", 'aider'],
  ['node-repl', "const { spawn } = require('node:child_process'); spawn('cursor-agent', [])", 'cursor-agent'],
  ['python-repl', "__import__('subprocess').run(['codex', 'exec', 'review'])", 'codex'],
  ['python-repl', "import subprocess as sp; sp.Popen(['/usr/bin/claude'])", 'claude'],
  ['python-repl', "from subprocess import run; run(['gemini', '-p', 'review'])", 'gemini'],
  ['python-repl', "import os; os.system('aider --message review')", 'aider'],
  ['python-repl', "import os as proc; proc.system('codex exec review')", 'codex'],
  ['python-repl', "from os import system as launch; launch('claude -p review')", 'claude'],
  ['python-repl', "import subprocess; subprocess.run(args=['gemini', '-p', 'review'])", 'gemini'],
  ['bun-repl', "Bun.spawn(['codex', 'exec', 'review'])", 'codex'],
  ['bun-repl', "Bun.spawn({ cmd: ['opencode', 'run', 'review'] })", 'opencode'],
  ['deno-repl', "new Deno.Command('cursor-agent', { args: ['review'] })", 'cursor-agent'],
];

for (const [mode, input, expectedAgent] of blocked) {
  const decision = evaluateAiAgentInteractiveInput(input, mode);
  assert.equal(decision.allowed, false, `expected blocked ${mode}: ${input}`);
  if (!decision.allowed) assert.equal(decision.agent, expectedAgent);
}

const allowed = [
  ['node-repl', '"codex"'],
  ['node-repl', 'codex is only data'],
  ['node-repl', 'const name = "codex"; name'],
  ['node-repl', "require('node:child_process').spawn('git', ['status'])"],
  ['python-repl', "print('codex')"],
  ['python-repl', "import subprocess; subprocess.run(['pytest'])"],
  ['python-repl', "import subprocess; subprocess.run(args=['pytest'])"],
  ['python-repl', "import os as proc; proc.system('git status')"],
  ['bun-repl', "Bun.spawn(['npm', 'test'])"],
  ['deno-repl', "new Deno.Command('git', { args: ['status'] })"],
];

for (const [mode, input] of allowed) {
  const decision = evaluateAiAgentInteractiveInput(input, mode);
  assert.equal(decision.allowed, true, `expected allowed ${mode}: ${input}`);
}

for (const mode of ['node-repl', 'python-repl', 'bun-repl', 'deno-repl']) {
  const oversized = evaluateAiAgentInteractiveInput(
    'x'.repeat(MAX_AI_AGENT_POLICY_INPUT_LENGTH + 1),
    mode,
  );
  assert.equal(oversized.allowed, false, `expected oversized ${mode} input to fail closed`);
}

console.log(`Interactive AI agent policy passed (${blocked.length} blocked, ${allowed.length} allowed)`);
