import assert from 'node:assert/strict';
import { classifyTerminalSession, detectCodexCliLaunch, isCodexExecutable } from '../dist/codex-guardrail.js';

const blocked = [
  'codex', 'codex exec review', 'codex.exe review', 'codex.cmd review', 'codex.ps1 review',
  '"C:\\Program Files\\Codex\\codex.exe" review', 'echo ready && codex review',
  'echo ready\ncodex exec review', 'echo ready\r\ncodex exec review',
  'npx @openai/codex', 'npx --yes @openai/codex',
  'npx @openai/codex --version', 'npx @openai/codex exec review',
  'npx --yes @openai/codex --version',
  'npm exec -- @openai/codex', 'npm x -- @openai/codex',
  'npm exec -- @openai/codex --version', 'npm x -- @openai/codex exec review',
];
const allowed = [
  'git status', 'npm test', 'node scripts/build.js', 'echo codex', 'rg codex README.md',
  'npm view @openai/codex version', 'npm install @openai/codex --save-dev',
  'node C:\\projects\\codex\\scripts\\build.js', 'node -e "console.log(\'codex\')"',
  'echo "ready\ncodex exec review"', 'CI=1 codex exec review',
  'claude --version', 'gemini --version', 'aider --version',
];
for (const command of blocked) assert.equal(detectCodexCliLaunch(command).matched, true, command);
for (const command of allowed) assert.deepEqual(detectCodexCliLaunch(command), { matched: false }, command);
for (const executable of ['codex', 'codex.exe', 'codex.cmd', 'C:\\tools\\codex.exe', '/usr/local/bin/codex']) {
  assert.equal(isCodexExecutable(executable), true, executable);
}
for (const executable of ['node', 'codex-helper', 'my-codex.cmd', 'C:\\projects\\codex\\build.exe']) {
  assert.equal(isCodexExecutable(executable), false, executable);
}
for (const command of [
  'cmd', 'cmd.exe /d /q', 'cmd.exe /k', 'cmd.exe /k echo ready',
  'powershell -NoLogo', 'powershell.exe -NoExit -Command "Write-Host ready"',
  'pwsh -NoLogo', 'pwsh -NoExit -File profile.ps1',
  'bash -i', 'sh', 'zsh -l',
]) {
  assert.equal(classifyTerminalSession(command), 'shell', command);
}
for (const command of [
  'node -i', 'python -i', 'bash script.sh', 'sh -c "echo ok"',
  'powershell -Command "Get-Date"', 'pwsh -File profile.ps1', 'cmd /c echo ok', 'fish -i',
]) {
  assert.equal(classifyTerminalSession(command), 'other', command);
}
console.log('Codex guardrail detector tests passed.');
