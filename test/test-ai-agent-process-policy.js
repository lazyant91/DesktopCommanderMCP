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

try {
  await configManager.setValue('blockedCommands', []);

  assert.equal(classifyInteractiveInputPolicy('python'), 'data');
  assert.equal(classifyInteractiveInputPolicy('python -q'), 'data');
  assert.equal(classifyInteractiveInputPolicy('python -W ignore'), 'data');
  assert.equal(classifyInteractiveInputPolicy('node'), 'data');
  assert.equal(classifyInteractiveInputPolicy('node --interactive'), 'data');
  assert.equal(classifyInteractiveInputPolicy('node --require ./hook.js'), 'data');
  assert.equal(classifyInteractiveInputPolicy('powershell'), 'command');
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

  terminalManager.getSession = (pid) =>
    pid === 2147483001
      ? { inputPolicyMode: 'data' }
      : originalGetSession(pid);

  for (const input of ['"codex"', 'codex is only data']) {
    const replInput = await interactWithProcess({
      pid: 2147483001,
      input,
      timeout_ms: 100,
    });
    assert.equal(replInput.isError, true);
    assert.doesNotMatch(replInput.content[0].text, /immutable policy/i);
    assert.match(replInput.content[0].text, /failed to send input/i);
  }

  console.log('AI agent policy process-entry enforcement passed');
} finally {
  terminalManager.getSession = originalGetSession;
  await configManager.updateConfig(originalConfig);
}
