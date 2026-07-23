import assert from 'node:assert/strict';

import {
  createAiAgentInteractivePolicyState,
  evaluateAiAgentInteractiveInput,
  evaluateAiAgentInteractiveInputWithState,
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
  ['node-repl', "require('node:child_process').spawn('cmd.exe', ['/c', 'codex', 'exec'])", 'codex'],
  ['python-repl', "subprocess.run(['cmd', '/c', 'codex', 'exec'])", 'codex'],
  ['bun-repl', "Bun.spawn(['cmd', '/c', 'codex', 'exec'])", 'codex'],
  ['deno-repl', "new Deno.Command('cmd', { args: ['/c', 'codex', 'exec'] })", 'codex'],
  ['python-repl', "subprocess.Popen(['--help'], executable='codex')", 'codex'],
  ['node-repl', "require('node:child_process').spawn('powershell', ['-Command', 'codex exec review'])", 'codex'],
  ['node-repl', "require('node:child_process')['spawn']('codex', ['exec'])", 'codex'],
  ['node-repl', "require('node:child_process').spawn('codex exec review', { shell: true })", 'codex'],
  ['node-repl', "require('node:child_process').spawn('echo harmless', { shell: 'codex' })", 'codex'],
  ['bun-repl', "Bun['spawn'](['codex', 'exec'])", 'codex'],
  ['deno-repl', "new Deno['Command']('codex')", 'codex'],
  ['python-repl', "subprocess.run(['bash', '-lc', 'codex exec review'])", 'codex'],
  ['python-repl', "subprocess.run(('cmd', '/c', 'codex', 'exec'))", 'codex'],
  ['node-repl', "`${require('node:child_process').spawn('codex', ['exec'])}`", 'codex'],
  ['python-repl', "f\"{__import__('subprocess').run(['codex', 'exec'])}\"", 'codex'],
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
  ['node-repl', "const example = \"require('node:child_process').spawn('codex')\""],
  ['node-repl', "// require('node:child_process').spawn('codex')"],
  ['node-repl', "/* require('node:child_process').spawn('codex') */"],
  ['node-repl', "const pattern = /require('node:child_process').spawn('codex')/"],
  ['node-repl', "/require('node:child_process').spawn('codex')/.test(source)"],
  ['node-repl', "const makePattern = () => /require('node:child_process').spawn('codex')/"],
  ['node-repl', "require('node:child_process').spawn('git', ['status'])"],
  ['node-repl', "require('node:child_process').spawn('cmd', ['/c', 'echo', 'codex'])"],
  ['node-repl', "require('node:child_process').spawn('echo codex', { shell: true })"],
  ['node-repl', '`hello ${name}`'],
  ['python-repl', "print('codex')"],
  ['python-repl', 'f"hello {name}"'],
  ['python-repl', "example = \"subprocess.run(['codex'])\""],
  ['python-repl', "# subprocess.run(['codex'])"],
  ['python-repl', "'''subprocess.run(['codex'])'''"],
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

const statefulCases = [
  ['node-repl', ["const cp = require('node:child_process')"], "cp.spawn('codex', ['exec'])", 'codex'],
  ['node-repl', ["const cp = require('node:child_process')"], "cp['spawn']('codex', ['exec'])", 'codex'],
  ['node-repl', ["const launch = require('node:child_process').spawn"], "launch('codex', ['exec'])", 'codex'],
  ['node-repl', ["const cp = require('node:child_process')", 'const { spawn: launch } = cp'], "launch('codex', ['exec'])", 'codex'],
  ['python-repl', ['import subprocess as sp'], "sp.run(['codex', 'exec'])", 'codex'],
  ['python-repl', ['import subprocess', 'launch = subprocess.run'], "launch(['codex', 'exec'])", 'codex'],
  ['python-repl', ['from subprocess import run, Popen as launch'], "launch(['codex'])", 'codex'],
  ['python-repl', ['import subprocess as sp, os as ops'], "ops.system('codex exec review')", 'codex'],
  ['bun-repl', ['const launch = Bun.spawn'], "launch(['codex', 'exec'])", 'codex'],
  ['bun-repl', ['const { spawn: launch } = Bun'], "launch(['codex', 'exec'])", 'codex'],
  ['deno-repl', ['const Command = Deno.Command'], "new Command('codex')", 'codex'],
  ['deno-repl', ['const { Command } = Deno'], "new Command('codex')", 'codex'],
];

for (const [mode, declarations, invocation, expectedAgent] of statefulCases) {
  let state = createAiAgentInteractivePolicyState();
  for (const declaration of declarations) {
    const declarationResult = evaluateAiAgentInteractiveInputWithState(
      declaration,
      mode,
      state,
    );
    assert.equal(declarationResult.decision.allowed, true, `expected alias declaration allowed: ${declaration}`);
    state = declarationResult.nextState;
  }
  const invocationResult = evaluateAiAgentInteractiveInputWithState(
    invocation,
    mode,
    state,
  );
  assert.equal(invocationResult.decision.allowed, false, `expected stateful alias blocked: ${invocation}`);
  if (!invocationResult.decision.allowed) {
    assert.equal(invocationResult.decision.agent, expectedAgent);
  }
}

const fullAliasState = createAiAgentInteractivePolicyState();
for (let index = 0; index < 64; index += 1) {
  fullAliasState.aliases[`cp${index}`] = 'node-child-process-receiver';
}
const aliasOverflow = evaluateAiAgentInteractiveInputWithState(
  "const overflow = require('node:child_process')",
  'node-repl',
  fullAliasState,
);
assert.equal(aliasOverflow.decision.allowed, false, 'alias state overflow must fail closed');

let reassignmentState = createAiAgentInteractivePolicyState();
reassignmentState = evaluateAiAgentInteractiveInputWithState(
  "const cp = require('node:child_process')",
  'node-repl',
  reassignmentState,
).nextState;
reassignmentState = evaluateAiAgentInteractiveInputWithState(
  'cp = {}',
  'node-repl',
  reassignmentState,
).nextState;
const reassignedCall = evaluateAiAgentInteractiveInputWithState(
  "cp.spawn('codex')",
  'node-repl',
  reassignmentState,
);
assert.equal(reassignedCall.decision.allowed, true, 'a statically reassigned alias must be forgotten');

for (const mode of ['node-repl', 'python-repl', 'bun-repl', 'deno-repl']) {
  const oversized = evaluateAiAgentInteractiveInput(
    'x'.repeat(MAX_AI_AGENT_POLICY_INPUT_LENGTH + 1),
    mode,
  );
  assert.equal(oversized.allowed, false, `expected oversized ${mode} input to fail closed`);
}

console.log(
  `Interactive AI agent policy passed (${blocked.length} blocked, ${allowed.length} allowed, ${statefulCases.length} stateful)`,
);
