import assert from 'node:assert/strict';

import { commandManager } from '../dist/command-manager.js';
import { configManager } from '../dist/config-manager.js';
import {
  interactWithProcess,
  startProcess,
} from '../dist/tools/improved-process-tools.js';

const originalConfig = await configManager.getConfig();

try {
  await configManager.setValue('blockedCommands', []);

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

  console.log('AI agent policy process-entry enforcement passed');
} finally {
  await configManager.updateConfig(originalConfig);
}
