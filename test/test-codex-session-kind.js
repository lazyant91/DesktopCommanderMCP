import assert from 'node:assert/strict';
import { terminalManager } from '../dist/terminal-manager.js';

async function inspect(command, expected) {
  const result = await terminalManager.executeCommand(command, 500);
  assert.ok(result.pid > 0, command);
  const session = terminalManager.getSession(result.pid);
  assert.ok(session, command);
  assert.equal(session.sessionKind, expected, command);
  terminalManager.forceTerminate(result.pid);
}

async function run() {
  await inspect(process.platform === 'win32' ? 'cmd.exe' : 'sh', 'shell');
  await inspect('node -i', 'other');
  console.log('Codex session-kind tests passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
