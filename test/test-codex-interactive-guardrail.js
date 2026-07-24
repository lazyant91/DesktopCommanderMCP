import assert from 'node:assert/strict';
import { classifyTerminalSession } from '../dist/codex-guardrail.js';
import { terminalManager } from '../dist/terminal-manager.js';
import { interactWithProcess } from '../dist/tools/improved-process-tools.js';

const originals = {
  getSession: terminalManager.getSession.bind(terminalManager),
  capture: terminalManager.captureOutputSnapshot.bind(terminalManager),
  send: terminalManager.sendInputToProcess.bind(terminalManager),
};
let kind = 'shell';
let sends = 0;

async function assertRefused(input) {
  sends = 0;
  const result = await interactWithProcess({ pid: 70001, input, wait_for_prompt: false });
  assert.equal(result.isError, true, input);
  assert.match(result.content[0].text, /Inline Execution/);
  assert.equal(sends, 0, input);
}

async function run() {
  terminalManager.getSession = () => ({ sessionKind: kind });
  terminalManager.captureOutputSnapshot = () => ({ totalChars: 0, lineCount: 0 });
  terminalManager.sendInputToProcess = () => { sends += 1; return true; };

  await assertRefused('codex exec review');
  await assertRefused('@codex exec review');
  await assertRefused('@npx @openai/codex');

  kind = classifyTerminalSession('cmd.exe /k echo ready');
  await assertRefused('@ codex exec review');
  await assertRefused('@ "C:\\Program Files\\Codex\\codex.cmd" review');
  await assertRefused('@ npx @openai/codex');
  await assertRefused('@ npm exec -- @openai/codex');
  await assertRefused('npx -- @openai/codex');
  await assertRefused('npx --yes -- @openai/codex@latest');
  await assertRefused('npx @openai/codex exec review');
  await assertRefused('npx @openai/codex@latest exec review');
  await assertRefused('npm exec -- @openai/codex@1.2.3 --version');
  await assertRefused('echo ready\ncodex exec review');
  await assertRefused('echo ready\r\ncodex exec review');
  await assertRefused('Set-Location C:\\; codex exec review');
  await assertRefused('Set-Location C:\\\ncodex exec review');
  await assertRefused("echo 'ready & codex exec review'");

  kind = classifyTerminalSession('cmd.exe /k echo ready');
  await assertRefused('codex exec review');
  kind = classifyTerminalSession('@ cmd.exe /d /k echo ready');
  await assertRefused('codex exec review');
  kind = classifyTerminalSession('cmd.exe /k echo ready /c');
  await assertRefused('codex exec review');
  kind = classifyTerminalSession('powershell.exe -NoExit -Command "Write-Host ready"');
  await assertRefused('codex exec review');
  kind = classifyTerminalSession('pwsh -NoExit -File profile.ps1');
  await assertRefused('codex exec review');
  kind = classifyTerminalSession('powershell.exe -Command -');
  await assertRefused('codex exec review');
  kind = classifyTerminalSession('pwsh -File -');
  await assertRefused('codex exec review');
  kind = classifyTerminalSession('bash -s arg1');
  await assertRefused('codex exec review');
  kind = classifyTerminalSession('sh -s -- arg1');
  await assertRefused('codex exec review');
  for (const command of [
    'powershell.exe -ExecutionPolicy Bypass',
    'powershell.exe -NoLogo -ExecutionPolicy Bypass',
    'pwsh -WorkingDirectory .',
    'pwsh -InputFormat Text',
    'pwsh -OutputFormat Text',
  ]) {
    kind = classifyTerminalSession(command);
    await assertRefused('codex exec review');
  }

  kind = classifyTerminalSession('cmd.exe /k echo ready');
  for (const input of ['@', '@ echo codex', '@ npx @openai/codex-helper@latest']) {
    sends = 0;
    const allowed = await interactWithProcess({ pid: 70001, input, wait_for_prompt: false });
    assert.equal(allowed.isError, undefined, input);
    assert.equal(sends, 1, input);
  }

  kind = 'shell';
  sends = 0;
  const shellData = await interactWithProcess({ pid: 70001, input: 'echo codex', wait_for_prompt: false });
  assert.equal(shellData.isError, undefined);
  assert.equal(sends, 1);

  kind = 'other';
  sends = 0;
  const replData = await interactWithProcess({ pid: 70002, input: '"codex"', wait_for_prompt: false });
  assert.equal(replData.isError, undefined);
  assert.equal(sends, 1);

  kind = undefined;
  sends = 0;
  const unknown = await interactWithProcess({ pid: 70003, input: 'codex', wait_for_prompt: false });
  assert.equal(unknown.isError, undefined);
  assert.equal(sends, 1);
  console.log('Codex interact_with_process guardrail tests passed.');
}

run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    terminalManager.getSession = originals.getSession;
    terminalManager.captureOutputSnapshot = originals.capture;
    terminalManager.sendInputToProcess = originals.send;
  });
