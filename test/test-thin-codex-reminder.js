import assert from 'node:assert/strict';
import {
  CODEX_REMINDER_MESSAGE,
  isCodexExecutable,
  isObviousCodexLaunch,
} from '../dist/codex-reminder.js';

const blocked = [
  'codex',
  'codex exec review',
  'codex.exe --version',
  'codex.cmd review',
  'codex.ps1 review',
  '"C:\\Program Files\\Codex\\codex.cmd" review',
  '/usr/local/bin/codex exec review',
  'npx @openai/codex',
  'npx @openai/codex exec review',
  'npx -y @openai/codex --version',
  'npx --yes @openai/codex exec review',
  'npm exec -- @openai/codex --version',
  'npm x -- @openai/codex exec review',
];

for (const command of blocked) {
  assert.equal(isObviousCodexLaunch(command), true, command);
}

const allowed = [
  '',
  'echo codex',
  'rg codex README.md',
  'node C:\\projects\\codex\\scripts\\build.js',
  'npm view @openai/codex version',
  'npm install @openai/codex --save-dev',
  'echo ready && codex exec review',
  'echo ready\ncodex exec review',
  'CI=1 codex exec review',
  '@codex exec review',
  '@ codex exec review',
  'npx -- @openai/codex',
  'npx @openai/codex@latest --version',
  'npm exec @openai/codex',
  'npm x @openai/codex',
  'npx @openai/codex-helper',
  'claude --version',
  'gemini --version',
  'aider --version',
];

for (const command of allowed) {
  assert.equal(isObviousCodexLaunch(command), false, command);
}

for (const executable of [
  'codex',
  'codex.exe',
  'codex.cmd',
  'codex.ps1',
  '"C:\\Program Files\\Codex\\codex.cmd"',
  '/usr/local/bin/codex',
]) {
  assert.equal(isCodexExecutable(executable), true, executable);
}

for (const executable of ['codex.bat', 'codex-helper', 'my-codex.cmd', undefined]) {
  assert.equal(isCodexExecutable(executable), false, String(executable));
}

assert.match(CODEX_REMINDER_MESSAGE, /thin accidental-use stop line/i);
assert.match(CODEX_REMINDER_MESSAGE, /not a complete block or security boundary/i);
assert.match(CODEX_REMINDER_MESSAGE, /Inline Execution/);

console.log('Thin Codex reminder detector tests passed.');
