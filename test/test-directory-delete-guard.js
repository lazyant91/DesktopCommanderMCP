import assert from 'node:assert/strict';
import {
  classifyDirectoryDeleteShell,
  formatDirectoryDeleteGuardError,
  validateDirectoryDeleteCommand,
} from '../dist/directory-delete-guard.js';

assert.equal(classifyDirectoryDeleteShell('powershell.exe'), 'powershell');
assert.equal(classifyDirectoryDeleteShell('C:\\Windows\\System32\\cmd.exe'), 'cmd');
assert.equal(classifyDirectoryDeleteShell('/bin/bash'), 'other');

const cwd = 'Z:\\workspace\\DesktopCommanderMCP';

for (const command of [
  'Remove-Item "D:\\" -Recurse -Force',
  'Remove-Item D:\\ -Force',
  'Remove-Item ..\\..\\.. -Recurse',
  'rd D:\\ -Recurse',
  'Write-Output ready; Remove-Item Z:\\ -Recurse -Force',
]) {
  const result = validateDirectoryDeleteCommand(command, 'powershell.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
  assert.equal(result.reason, 'filesystem-root', command);
  assert.match(formatDirectoryDeleteGuardError(result), /No command was executed/);
}

for (const command of [
  'Remove-Item ".\\dist" -Recurse -Force',
  'Remove-Item -LiteralPath "Z:\\workspace\\DesktopCommanderMCP\\cache" -Recurse',
  'rmdir "Z:\\workspace\\DesktopCommanderMCP\\temp" -Recurse',
]) {
  const result = validateDirectoryDeleteCommand(command, 'powershell.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, true, command);
}

for (const command of [
  'Remove-Item $target -Recurse -Force',
  'Remove-Item "Z:\\workspace\\temp -Recurse',
  'Remove-Item -Recurse',
  'rm -rf .\\dist',
]) {
  const result = validateDirectoryDeleteCommand(command, 'powershell.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
}

for (const command of [
  'rd /s /q D:\\',
  'rmdir /s /q "D:\\"',
  'echo ready & rd /s /q Z:\\',
]) {
  const result = validateDirectoryDeleteCommand(command, 'cmd.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
  assert.equal(result.reason, 'filesystem-root', command);
}

for (const command of [
  'rd /s /q "Z:\\workspace\\DesktopCommanderMCP\\dist"',
  'rmdir "Z:\\workspace\\DesktopCommanderMCP\\empty"',
]) {
  const result = validateDirectoryDeleteCommand(command, 'cmd.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, true, command);
}

for (const command of [
  'rd /s /q %TARGET%',
  'rd /s /q "Z:\\workspace\\temp',
  'rd /x Z:\\workspace\\temp',
  'rd /s /q',
]) {
  const result = validateDirectoryDeleteCommand(command, 'cmd.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
}

assert.equal(
  validateDirectoryDeleteCommand('Remove-Item .\\temp.txt', 'powershell.exe', cwd).detected,
  false,
);
assert.equal(validateDirectoryDeleteCommand('echo ready', 'cmd.exe', cwd).detected, false);
assert.equal(
  validateDirectoryDeleteCommand('rm -rf /', '/bin/bash', cwd).detected,
  false,
);

console.log('Directory delete guard tests passed.');
