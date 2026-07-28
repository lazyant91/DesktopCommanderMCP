import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installDirectoryDeleteGuard } from '../dist/directory-delete-guard-runtime.js';

let executeCalls = 0;
let sendCalls = 0;
let nextPid = 321;
const activeSessions = new Set();
const manager = {
  async executeCommand() {
    executeCalls += 1;
    activeSessions.add(nextPid);
    return { pid: nextPid, output: 'ok', isBlocked: false };
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

const incidentCommand = String.raw`$featurePath='D:\AI\WebService\VibeTutor\learnrepo\.worktrees\codex-oauth-provider-pr1'

if (Test-Path $featurePath) {
    cmd /c "rmdir /s /q \"$featurePath\""
}`;

const blockedIncident = await manager.executeCommand(
  incidentCommand,
  100,
  'powershell.exe',
  false,
);
assert.equal(blockedIncident.pid, -1);
assert.match(blockedIncident.output, /direct literal-path deletion command/i);
assert.equal(executeCalls, 0);

const blockedStart = await manager.executeCommand(
  'Remove-Item Z:\\ -Recurse -Force',
  100,
  'powershell.exe',
  false,
);
assert.equal(blockedStart.pid, -1);
assert.match(blockedStart.output, /Catastrophic directory deletion blocked/);
assert.equal(executeCalls, 0);

const blockedLocationChange = await manager.executeCommand(
  'Set-Location D:\\; Remove-Item . -Recurse -Force',
  100,
  'powershell.exe',
  false,
);
assert.equal(blockedLocationChange.pid, -1);
assert.match(blockedLocationChange.output, /direct literal-path deletion command/i);
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

assert.throws(
  () =>
    manager.sendInputToProcess(
      321,
      "cmd /c 'rmdir /s /q \"D:\\AI\\project\\.worktrees\\feature\"'",
    ),
  /direct literal-path deletion command/i,
);
assert.equal(sendCalls, 0);

assert.throws(
  () => manager.sendInputToProcess(321, 'Remove-Item .\\temp -Recurse'),
  /fully qualified filesystem path/i,
);
assert.equal(sendCalls, 0);

assert.equal(
  manager.sendInputToProcess(
    321,
    "Remove-Item -LiteralPath 'Z:\\workspace\\DesktopCommanderMCP\\temp' -Recurse",
  ),
  true,
);
assert.equal(sendCalls, 1);

const nestedPowerShell = await manager.executeCommand(
  'powershell.exe -NoExit',
  100,
  'cmd.exe',
  false,
);
assert.equal(nestedPowerShell.pid, 321);
assert.equal(executeCalls, 2);
assert.throws(
  () => manager.sendInputToProcess(321, 'Remove-Item Z:\\ -Recurse -Force'),
  /Catastrophic directory deletion blocked/,
);
assert.equal(sendCalls, 1);

const nestedCmd = await manager.executeCommand('cmd.exe', 100, 'powershell.exe', false);
assert.equal(nestedCmd.pid, 321);
assert.equal(executeCalls, 3);
assert.equal(
  manager.sendInputToProcess(
    321,
    'rd /s /q "Z:\\workspace\\DesktopCommanderMCP\\temp"',
  ),
  true,
);
assert.equal(sendCalls, 2);
assert.throws(
  () => manager.sendInputToProcess(321, 'rd /s /q Z:\\'),
  /Catastrophic directory deletion blocked/,
);
assert.equal(sendCalls, 2);

activeSessions.delete(321);
nextPid = 322;
const replacementSession = await manager.executeCommand(
  'powershell.exe -NoExit',
  100,
  'powershell.exe',
  false,
);
assert.equal(replacementSession.pid, 322);
assert.equal(executeCalls, 4);

activeSessions.delete(322);
activeSessions.add(321);
assert.equal(manager.sendInputToProcess(321, 'rd /s /q Z:\\'), true);
assert.equal(sendCalls, 3);

const indexSource = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
assert.match(indexSource, /installDirectoryDeleteGuard\(\)/);

console.log('Directory delete guard runtime tests passed.');
