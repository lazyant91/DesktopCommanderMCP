import assert from 'node:assert/strict';
import { terminalManager } from '../dist/terminal-manager.js';

async function inspect(command, expected) {
  let pid = -1;
  try {
    const result = await terminalManager.executeCommand(command, 500);
    pid = result.pid;
    assert.ok(pid > 0, command);
    const session = terminalManager.getSession(pid);
    assert.ok(session, command);
    assert.equal(session.sessionKind, expected, command);
  } finally {
    if (pid > 0) terminalManager.forceTerminate(pid);
  }
}

async function run() {
  if (process.platform === 'win32') {
    await inspect('cmd.exe', 'shell');
    await inspect('cmd.exe /k echo ready', 'shell');
    await inspect('cmd.exe /k echo ready /c', 'shell');
    await inspect('powershell.exe -ExecutionPolicy Bypass', 'shell');
    await inspect('powershell.exe -NoLogo -NoProfile -Command -', 'shell');
  } else {
    await inspect('sh', 'shell');
  }
  await inspect('node -i', 'other');
  console.log('Codex session-kind tests passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
