import assert from 'node:assert/strict';
import { configManager } from '../dist/config-manager.js';
import { CODEX_GUARDRAIL_MESSAGE } from '../dist/codex-guardrail.js';
import { terminalManager } from '../dist/terminal-manager.js';
import { startProcess } from '../dist/tools/improved-process-tools.js';

const originalExecute = terminalManager.executeCommand.bind(terminalManager);
let originalConfig;
let calls = 0;

function assertReminder(result) {
  assert.equal(result.isError, true);
  assert.equal(result.content?.[0]?.text, CODEX_GUARDRAIL_MESSAGE);
  for (const phrase of [
    'Local Codex CLI execution was not performed',
    'local Codex subscription quota',
    'Inline Execution',
    'local Codex-backed Subagent',
    'do not work around this refusal',
    'started directly by the human operator',
  ]) assert.match(result.content[0].text, new RegExp(phrase, 'i'));
}

async function run() {
  originalConfig = await configManager.getConfig();
  terminalManager.executeCommand = async () => {
    calls += 1;
    return { pid: 43210, output: 'safe stub', isBlocked: false };
  };
  await configManager.setValue('blockedCommands', []);

  for (const args of [
    { command: 'codex exec review', timeout_ms: 100 },
    { command: 'npx @openai/codex', timeout_ms: 100 },
    { command: 'npx @openai/codex exec review', timeout_ms: 100 },
    { command: 'npm exec -- @openai/codex --version', timeout_ms: 100 },
    { command: 'echo ready && codex review', timeout_ms: 100 },
    { command: 'echo ready\ncodex exec review', timeout_ms: 100 },
    { command: 'echo ready\r\ncodex exec review', timeout_ms: 100 },
    { command: 'echo safe', timeout_ms: 100, shell: 'codex.exe' },
  ]) {
    calls = 0;
    assertReminder(await startProcess(args));
    assert.equal(calls, 0, JSON.stringify(args));
  }

  await configManager.setValue('defaultShell', 'codex.cmd');
  calls = 0;
  assertReminder(await startProcess({ command: 'echo safe', timeout_ms: 100 }));
  assert.equal(calls, 0);

  await configManager.updateConfig({ ...originalConfig, blockedCommands: [] });
  calls = 0;
  const allowed = await startProcess({ command: 'echo codex', timeout_ms: 100 });
  assert.equal(allowed.isError, undefined);
  assert.equal(calls, 1);
  console.log('Codex start_process guardrail tests passed.');
}

run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => {
    terminalManager.executeCommand = originalExecute;
    if (originalConfig) await configManager.updateConfig(originalConfig);
  });
