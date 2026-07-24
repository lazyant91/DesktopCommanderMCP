import assert from 'node:assert/strict';
import { classifyTerminalSession, detectCodexCliLaunch, isCodexExecutable } from '../dist/codex-guardrail.js';

const blocked = [
  'codex', '@codex exec review', 'codex exec review', 'CODEX.EXE review', 'codex.cmd review', 'codex.ps1 review',
  "'codex.cmd' exec review", '@"C:\\Program Files\\Codex\\codex.cmd" review',
  '"C:\\Program Files\\Codex\\codex.exe" review',
  'echo ready && codex review',
  'echo ready\ncodex exec review', 'echo ready\r\ncodex exec review',
  'Set-Location C:\\; codex exec review', 'Set-Location C:\\\ncodex exec review',
  "echo 'ready & codex exec review'",
  'npx @openai/codex', '@npx @openai/codex', 'npx -- @openai/codex',
  'npx --yes @openai/codex', 'npx --yes -- @openai/codex@latest',
  'npx -y -- @openai/codex@1.2.3',
  'npx @openai/codex --version', 'npx @openai/codex exec review',
  'npx @openai/codex@latest exec review', 'npx --yes @openai/codex@1.2.3 --version',
  'npx --yes @openai/codex --version',
  'C:\\Windows\\System32\\npx.cmd --yes "@openai/codex" exec review',
  'npm exec -- @openai/codex', 'npm x -- @openai/codex',
  'npm exec -- @openai/codex --version', 'npm x -- @openai/codex exec review',
  'npm exec -- @openai/codex@latest --version', 'npm x @openai/codex@1.2.3 exec review',
  '"C:\\Program Files\\nodejs\\npm.cmd" x -- "@openai/codex" --version',
];
const allowed = [
  'git status', 'npm test', 'node scripts/build.js', 'echo codex', 'rg codex README.md',
  'npm view @openai/codex version', 'npm install @openai/codex --save-dev',
  'npm.cmd view @openai/codex version', 'npm.cmd install @openai/codex --save-dev',
  'npx @openai/codex-helper@latest', 'npm exec -- @openai/codex-tools@1.0.0',
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
  'cmd.exe /k echo ready /c',
  'powershell -NoLogo', 'powershell.exe -NoExit -Command "Write-Host ready"',
  'powershell.exe -Command -', 'powershell.exe -File -', 'powershell.exe -c -',
  'powershell.exe -ExecutionPolicy Bypass', 'powershell.exe -NoLogo -ExecutionPolicy Bypass',
  'pwsh -NoLogo', 'pwsh -NoExit -File profile.ps1', 'pwsh -Command -', 'pwsh -File -', 'pwsh -f -',
  'pwsh -WorkingDirectory .',
  'pwsh -InputFormat Text', 'pwsh -OutputFormat Text',
  'bash -i', 'bash -s arg1', 'sh', 'sh -s -- arg1', 'zsh -l', 'zsh -s arg1',
]) {
  assert.equal(classifyTerminalSession(command), 'shell', command);
}
for (const command of [
  'node -i', 'python -i', 'bash script.sh', 'bash script.sh -s', 'bash -- -s',
  'bash --rcfile profile.sh -i', 'sh -c "echo ok"',
  'powershell -Command "Get-Date"', 'powershell -c "Get-Date"',
  'pwsh -File profile.ps1', 'pwsh -f profile.ps1',
  'powershell -Command "Get-Date" -NoExit', 'pwsh -File profile.ps1 -NoExit',
  'powershell profile.ps1', 'pwsh profile.ps1', 'pwsh -WorkingDirectory . profile.ps1',
  'powershell -ExecutionPolicy', 'cmd /c echo ok', 'fish -i',
]) {
  assert.equal(classifyTerminalSession(command), 'other', command);
}
console.log('Codex guardrail detector tests passed.');
