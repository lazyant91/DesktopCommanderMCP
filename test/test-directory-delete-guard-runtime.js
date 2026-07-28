import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installDirectoryDeleteGuard } from '../dist/directory-delete-guard-runtime.js';

let executeCalls = 0;
let sendCalls = 0;
const activeSessions = new Set();
const manager = {
  async executeCommand() {
    executeCalls += 1;
    activeSessions.add(321);
    return { pid: 321, output: 'ok', isBlocked: false };
  },
  sendInputToProcess() {
    sendCalls += 1;
    return true;
  },
  getSession(pid) {
    return activeSessions.has(pid) ? { pid } : undefined;
  },
};

installDirectoryDeleteGuard(manager);
installDirectoryDeleteGuard(manager);

const blockedStart = await manager.executeCommand(
  'Remove-Item Z:\\ -Recurse -Force',
  100,
  'powershell.exe',
  false,
);
assert.equal(blockedStart.pid, -1);
assert.match(blockedStart.output, /Catastrophic directory deletion blocked/);
assert.equal(executeCalls, 0);

const invalidStart = await manager.executeCommand(
  'rd /s /q %TARGET%',
  100,
  'cmd.exe',
  false,
);
assert.equal(invalidStart.pid, -1);
assert.match(invalidStart.output, /explicit literal directory path/);
assert.equal(executeCalls, 0);

const allowedStart = await manager.executeCommand(
  'Remove-Item .\\dist -Recurse -Force',
  100,
  'powershell.exe',
  false,
);
assert.equal(allowedStart.pid, 321);
assert.equal(executeCalls, 1);

assert.throws(
  () => manager.sendInputToProcess(321, 'Remove-Item Z:\\ -Recurse -Force'),
  /Catastrophic directory deletion blocked/,
);
assert.equal(sendCalls, 0);

assert.equal(manager.sendInputToProcess(321, 'Remove-Item .\\temp -Recurse'), true);
assert.equal(sendCalls, 1);

const indexSource = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
assert.match(indexSource, /installDirectoryDeleteGuard\(\)/);

console.log('Directory delete guard runtime tests passed.');
