import assert from 'node:assert/strict';
import { commandManager } from '../dist/command-manager.js';
import { configManager } from '../dist/config-manager.js';
import { terminalManager } from '../dist/terminal-manager.js';
import { startProcess } from '../dist/tools/improved-process-tools.js';

const originalValidate = commandManager.validateCommand;
const originalExecute = terminalManager.executeCommand;
const originalGetConfig = configManager.getConfig;

let validateCalls = 0;
let executeCalls = 0;
let defaultShell = 'powershell.exe';

commandManager.validateCommand = async () => {
  validateCalls += 1;
  return true;
};
terminalManager.executeCommand = async () => {
  executeCalls += 1;
  return { pid: 1234, output: 'ok', isBlocked: false };
};
configManager.getConfig = async () => ({
  blockedCommands: [],
  allowedDirectories: [],
  defaultShell,
  fileReadLineLimit: 1000,
  fileWriteLineLimit: 50,
});

async function expectRefused(args) {
  validateCalls = 0;
  executeCalls = 0;
  const result = await startProcess({ timeout_ms: 100, ...args });
  assert.equal(result.isError, true, JSON.stringify(args));
  assert.match(result.content[0].text, /thin accidental-use stop line/i);
  assert.equal(validateCalls, 0, JSON.stringify(args));
  assert.equal(executeCalls, 0, JSON.stringify(args));
}

async function expectAllowed(args) {
  validateCalls = 0;
  executeCalls = 0;
  const result = await startProcess({ timeout_ms: 100, ...args });
  assert.notEqual(result.isError, true, JSON.stringify(args));
  assert.equal(validateCalls, 1, JSON.stringify(args));
  assert.equal(executeCalls, 1, JSON.stringify(args));
}

try {
  for (const command of [
    'codex exec review',
    '"C:\\Program Files\\Codex\\codex.cmd" review',
    'npx @openai/codex exec review',
    'npm exec -- @openai/codex --version',
  ]) {
    defaultShell = 'powershell.exe';
    await expectRefused({ command });
  }

  await expectRefused({ command: 'echo ready', shell: 'codex.cmd' });
  defaultShell = 'C:\\Tools\\codex.exe';
  await expectRefused({ command: 'echo ready' });

  defaultShell = 'powershell.exe';
  for (const command of [
    'echo codex',
    'echo ready && codex exec review',
    'echo ready\ncodex exec review',
    'CI=1 codex exec review',
    '@ codex exec review',
    'npx -- @openai/codex',
    'npx @openai/codex@latest',
    'npm exec @openai/codex',
    'claude --version',
  ]) {
    await expectAllowed({ command });
  }
} finally {
  commandManager.validateCommand = originalValidate;
  terminalManager.executeCommand = originalExecute;
  configManager.getConfig = originalGetConfig;
}

console.log('Thin Codex start_process reminder tests passed.');
