import assert from 'node:assert/strict';

import { commandManager } from '../dist/command-manager.js';
import { configManager } from '../dist/config-manager.js';
import {
  classifyInteractiveInputPolicy,
  terminalManager,
} from '../dist/terminal-manager.js';
import {
  interactWithProcess,
  startProcess,
} from '../dist/tools/improved-process-tools.js';

const originalConfig = await configManager.getConfig();
const originalGetSession = terminalManager.getSession.bind(terminalManager);
const originalExecuteCommand = terminalManager.executeCommand.bind(terminalManager);
let executeCommandCalls = 0;

try {
  await configManager.setValue('blockedCommands', []);

  assert.equal(classifyInteractiveInputPolicy('python'), 'python-repl');
  assert.equal(classifyInteractiveInputPolicy('python -q'), 'python-repl');
  assert.equal(classifyInteractiveInputPolicy('python -W ignore'), 'python-repl');
  assert.equal(classifyInteractiveInputPolicy('node'), 'node-repl');
  assert.equal(classifyInteractiveInputPolicy('node --interactive'), 'node-repl');
  assert.equal(classifyInteractiveInputPolicy('node --require ./hook.js'), 'node-repl');
  assert.equal(classifyInteractiveInputPolicy('deno repl'), 'deno-repl');
  assert.equal(classifyInteractiveInputPolicy('bun repl'), 'bun-repl');
  assert.equal(classifyInteractiveInputPolicy('cmd'), 'cmd-shell');
  assert.equal(classifyInteractiveInputPolicy('powershell'), 'powershell-shell');
  assert.equal(classifyInteractiveInputPolicy('pwsh -NoLogo'), 'powershell-shell');
  assert.equal(classifyInteractiveInputPolicy('bash'), 'posix-shell');
  assert.equal(classifyInteractiveInputPolicy('powershell -Command "npm test"'), 'command');
  assert.equal(classifyInteractiveInputPolicy('bash -lc "npm test"'), 'command');
  assert.equal(classifyInteractiveInputPolicy('python script.py'), 'command');
  assert.equal(classifyInteractiveInputPolicy('python -W ignore script.py'), 'command');
  assert.equal(classifyInteractiveInputPolicy('node script.js'), 'command');
  assert.equal(classifyInteractiveInputPolicy('node --require ./hook.js script.js'), 'command');

  const validation = await commandManager.validateCommand('codex exec review');
  assert.equal(
    validation,
    false,
    'immutable policy must deny AI CLIs even when blockedCommands is empty',
  );

  terminalManager.executeCommand = async () => {
    executeCommandCalls += 1;
    return { pid: -1, output: 'mocked spawn', isBlocked: false };
  };

  const shellOverride = await startProcess({
    command: 'echo harmless',
    shell: 'codex',
    timeout_ms: 100,
  });
  assert.equal(shellOverride.isError, true);
  assert.match(shellOverride.content[0].text, /immutable policy/i);
  assert.equal(executeCommandCalls, 0, 'blocked shell override must not reach executeCommand');

  await configManager.setValue('defaultShell', 'codex');
  const blockedDefaultShell = await startProcess({
    command: 'echo harmless',
    timeout_ms: 100,
  });
  assert.equal(blockedDefaultShell.isError, true);
  assert.match(blockedDefaultShell.content[0].text, /immutable policy/i);
  assert.equal(executeCommandCalls, 0, 'blocked defaultShell must not reach executeCommand');
  await configManager.updateConfig({
    ...(await configManager.getConfig()),
    defaultShell: originalConfig.defaultShell,
  });

  const cmdTitle = await startProcess({
    command: 'start "codex" echo ok',
    shell: 'cmd.exe',
    timeout_ms: 100,
  });
  assert.equal(cmdTitle.isError, true);
  assert.doesNotMatch(cmdTitle.content[0].text, /immutable policy/i);
  assert.match(cmdTitle.content[0].text, /mocked spawn/i);
  assert.equal(executeCommandCalls, 1, 'harmless CMD title must reach executeCommand');

  const powerShellStart = await startProcess({
    command: 'start "codex" exec review',
    shell: 'powershell.exe',
    timeout_ms: 100,
  });
  assert.equal(powerShellStart.isError, true);
  assert.match(powerShellStart.content[0].text, /immutable policy/i);
  assert.equal(executeCommandCalls, 1, 'blocked PowerShell start must not reach executeCommand');

  const direct = await startProcess({
    command: '"D:\\definitely-missing-ai-cli-test\\codex.exe" exec review',
    timeout_ms: 100,
  });
  assert.equal(direct.isError, true, 'direct AI CLI path must be rejected before spawn');
  assert.match(direct.content[0].text, /immutable policy/i);
  assert.doesNotMatch(direct.content[0].text, /definitely-missing-ai-cli-test/i);

  const wrapped = await startProcess({
    command:
      'powershell -Command "& \'D:\\definitely-missing-ai-cli-test\\claude.exe\' -p review"',
    timeout_ms: 100,
  });
  assert.equal(wrapped.isError, true, 'wrapped AI CLI path must be rejected before spawn');
  assert.match(wrapped.content[0].text, /immutable policy/i);
  assert.doesNotMatch(wrapped.content[0].text, /definitely-missing-ai-cli-test/i);

  const interactive = await interactWithProcess({
    pid: 2147483000,
    input: 'opencode run review',
    timeout_ms: 100,
  });
  assert.equal(interactive.isError, true);
  assert.match(interactive.content[0].text, /immutable policy/i);

  const normalInput = await interactWithProcess({
    pid: 2147483000,
    input: 'git status',
    timeout_ms: 100,
  });
  assert.equal(normalInput.isError, true);
  assert.doesNotMatch(normalInput.content[0].text, /immutable policy/i);
  assert.match(normalInput.content[0].text, /failed to send input/i);

  terminalManager.getSession = (pid) => {
    if (pid === 2147483001) return { inputPolicyMode: 'node-repl' };
    if (pid === 2147483002) return { inputPolicyMode: 'python-repl' };
    if (pid === 2147483003) return { inputPolicyMode: 'cmd-shell' };
    if (pid === 2147483004) return { inputPolicyMode: 'powershell-shell' };
    return originalGetSession(pid);
  };

  for (const pid of [2147483001, 2147483002]) {
    for (const input of ['"codex"', 'codex is only data']) {
      const replInput = await interactWithProcess({
        pid,
        input,
        timeout_ms: 100,
      });
      assert.equal(replInput.isError, true);
      assert.doesNotMatch(replInput.content[0].text, /immutable policy/i);
      assert.match(replInput.content[0].text, /failed to send input/i);
    }
  }

  const cmdWindowTitle = await interactWithProcess({
    pid: 2147483003,
    input: 'start "codex" echo ok',
    timeout_ms: 100,
  });
  assert.equal(cmdWindowTitle.isError, true);
  assert.doesNotMatch(cmdWindowTitle.content[0].text, /immutable policy/i);
  assert.match(cmdWindowTitle.content[0].text, /failed to send input/i);

  const cmdTarget = await interactWithProcess({
    pid: 2147483003,
    input: 'start "" codex exec review',
    timeout_ms: 100,
  });
  assert.equal(cmdTarget.isError, true);
  assert.match(cmdTarget.content[0].text, /immutable policy/i);

  const powerShellTarget = await interactWithProcess({
    pid: 2147483004,
    input: 'start "codex" exec review',
    timeout_ms: 100,
  });
  assert.equal(powerShellTarget.isError, true);
  assert.match(powerShellTarget.content[0].text, /immutable policy/i);

  const nodeSpawn = await interactWithProcess({
    pid: 2147483001,
    input: "require('node:child_process').spawn('codex', ['exec', 'review'])",
    timeout_ms: 100,
  });
  assert.equal(nodeSpawn.isError, true);
  assert.match(nodeSpawn.content[0].text, /immutable policy/i);

  const pythonSpawn = await interactWithProcess({
    pid: 2147483002,
    input: "__import__('subprocess').run(['codex', 'exec', 'review'])",
    timeout_ms: 100,
  });
  assert.equal(pythonSpawn.isError, true);
  assert.match(pythonSpawn.content[0].text, /immutable policy/i);

  console.log('AI agent policy process-entry enforcement passed');
} finally {
  terminalManager.getSession = originalGetSession;
  terminalManager.executeCommand = originalExecuteCommand;
  await configManager.updateConfig(originalConfig);
}
