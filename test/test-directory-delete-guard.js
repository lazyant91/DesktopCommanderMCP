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
const incidentCommand = String.raw`$featurePath='D:\AI\WebService\VibeTutor\learnrepo\.worktrees\codex-oauth-provider-pr1'

if (Test-Path $featurePath) {
    cmd /c "rmdir /s /q \"$featurePath\""
}`;

for (const command of [
  'Remove-Item "D:\\" -Recurse -Force',
  'Remove-Item D:\\ -Force',
  'Remove-Item ..\\..\\.. -Recurse',
  'Remove-Item Z:\\. -Recurse -Force',
  'Remove-Item Z:\\* -Recurse -Force',
  'Remove-Item \\\\server\\share\\ -Recurse -Force',
  'Remove-Item \\\\?\\Z:\\ -Recurse -Force',
  'Remove-Item \\\\.\\Z:\\ -Recurse -Force',
  'Remove-Item \\\\?\\UNC\\server\\share\\ -Recurse -Force',
  'rd D:\\ -Recurse',
  'del Z:\\ -Recurse -Force',
  'erase Z:\\ -Recurse -Force',
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
  "Remove-Item -LiteralPath 'Z:\\workspace\\DesktopCommanderMCP\\stale' -Recurse -Force -ErrorAction SilentlyContinue",
  'Remove-Item "Z:\\workspace\\DesktopCommanderMCP\\comma,name" -Recurse',
  "Remove-Item 'Z:\\workspace\\DesktopCommanderMCP\\$literal' -Recurse",
  'rmdir "Z:\\workspace\\DesktopCommanderMCP\\temp" -Recurse',
]) {
  const result = validateDirectoryDeleteCommand(command, 'powershell.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, true, command);
}

for (const command of [
  'Remove-Item $target -Recurse -Force',
  'Remove-Item "$target" -Recurse -Force',
  'Remove-Item "Z:\\workspace\\temp -Recurse',
  'Remove-Item -Recurse',
  '`Remove-Item Z:\\ -Recurse -Force',
  "Remove-Item 'Z:\\workspace\\one' 'Z:\\workspace\\two' -Recurse -Force",
  "Remove-Item 'Z:\\workspace\\safe\\*' -Recurse -Force",
  "Remove-Item ('D:\\') -Recurse -Force",
  'Remove-Item D:temp -Recurse -Force',
  'Remove-Item HKLM:\\Software\\Example -Recurse -Force',
  'rm -rf .\\dist',
]) {
  const result = validateDirectoryDeleteCommand(command, 'powershell.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
}

assert.equal(
  validateDirectoryDeleteCommand(
    "Remove-Item -LiteralPath 'Z:\\workspace\\safe\\[archive]' -Recurse -Force",
    'powershell.exe',
    cwd,
  ).allowed,
  true,
);

for (const command of [
  'rd /s /q D:\\',
  'rmdir /s /q "D:\\"',
  '@rd /s /q Z:\\',
  '@ rd /s /q Z:\\',
  'rd /s /q Z:\\.',
  'rd /s /q Z:\\*',
  'rd /s /q \\\\server\\share\\',
  'rd /s /q \\\\?\\Z:\\',
  'rd /s /q \\\\.\\Z:\\',
  'rd /s /q \\\\?\\UNC\\server\\share\\',
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
  '@rd /s /q "Z:\\workspace\\temp',
  'rd /x Z:\\workspace\\temp',
  'rd /s /q',
  '^rmdir /s /q Z:\\',
  'rd /s /q D:temp',
  'rd /s /q Z:\\workspace\\safe\\*',
]) {
  const result = validateDirectoryDeleteCommand(command, 'cmd.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
}

for (const [command, shell] of [
  ["Set-Location D:\\; Remove-Item . -Recurse -Force", 'powershell.exe'],
  ["Write-Output ready; Remove-Item 'Z:\\workspace\\safe' -Recurse -Force", 'powershell.exe'],
  ['cd /d D:\\ & rd /s /q .', 'cmd.exe'],
  ['echo ready & rd /s /q Z:\\workspace\\safe', 'cmd.exe'],
]) {
  const result = validateDirectoryDeleteCommand(command, shell, cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
  assert.equal(result.reason, 'unsupported-context', command);
}

for (const [command, shell] of [
  ['Remove-Item .\\temp -Recurse -Force', 'powershell.exe'],
  ['rd /s /q .\\temp', 'cmd.exe'],
]) {
  const result = validateDirectoryDeleteCommand(command, shell, cwd, {
    requireFullyQualifiedTarget: true,
  });
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
  assert.equal(result.reason, 'ambiguous-target', command);
}

for (const command of [
  incidentCommand,
  "cmd /c 'rmdir /s /q \"D:\\AI\\project\\.worktrees\\feature\"'",
  "cmd.exe /d /s /c 'rmdir /s /q \"D:\\AI\\project\\.worktrees\\feature\"'",
  "cmd.exe /d /s /c'rmdir /s /q \"D:\\AI\\project\\.worktrees\\feature\"'",
  'cmd.exe /c^"rmdir /s /q Z:\\"',
  "if (Test-Path -LiteralPath 'D:\\AI\\project\\.worktrees\\feature') { Remove-Item -LiteralPath 'D:\\AI\\project\\.worktrees\\feature' -Recurse -Force }",
  String.raw`if (Test-Path -LiteralPath 'D:\AI\project\.worktrees\feature') {
    Remove-Item -LiteralPath 'D:\AI\project\.worktrees\feature' -Recurse -Force
}`,
]) {
  const result = validateDirectoryDeleteCommand(command, 'powershell.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
  assert.equal(result.reason, 'unsupported-context', command);
  assert.match(formatDirectoryDeleteGuardError(result), /direct literal-path deletion command/i);
}

for (const command of [
  'call rd /s /q "D:\\AI\\project\\.worktrees\\feature"',
  'call powershell.exe -Command "Remove-Item -LiteralPath \'D:\\AI\\project\\.worktrees\\feature\' -Recurse -Force"',
  'powershell.exe -Command "Remove-Item -LiteralPath \'D:\\AI\\project\\.worktrees\\feature\' -Recurse -Force"',
  'powershell.exe -NoProfile -NonInteractive -Command "Remove-Item -LiteralPath \'D:\\AI\\project\\.worktrees\\feature\' -Recurse -Force"',
  'powershell.exe -NoProfile -Command"Remove-Item -LiteralPath \'D:\\AI\\project\\.worktrees\\feature\' -Recurse -Force"',
  '@powershell.exe /c "Remove-Item -LiteralPath \'D:\\AI\\project\\.worktrees\\feature\' -Recurse -Force"',
  '(rmdir /s /q "D:\\AI\\project\\.worktrees\\feature")',
  String.raw`if exist "D:\AI\project\.worktrees\feature" (
    rmdir /s /q "D:\AI\project\.worktrees\feature"
)`,
]) {
  const result = validateDirectoryDeleteCommand(command, 'cmd.exe', cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
  assert.equal(result.reason, 'unsupported-context', command);
}

for (const [command, shell] of [
  ['cmd /c "rmdir /s /q D:\\AI\\project\\temp', 'powershell.exe'],
  [
    'powershell.exe -Command "Remove-Item -LiteralPath \'D:\\AI\\project\\temp\' -Recurse -Force',
    'cmd.exe',
  ],
]) {
  const result = validateDirectoryDeleteCommand(command, shell, cwd);
  assert.equal(result.detected, true, command);
  assert.equal(result.allowed, false, command);
  assert.equal(result.reason, 'invalid-syntax', command);
}

for (const command of [
  "Write-Output 'Example: rmdir /s /q D:\\temp'",
  'Write-Output "Example: Remove-Item D:\\temp -Recurse"',
  'Get-Item rmdir',
  'Test-Path Remove-Item',
  "cmd /c 'echo ready'",
  "cmd /c 'echo rmdir /s /q D:\\temp'",
  "cmd.exe /d /s /c 'echo rmdir /s /q D:\\temp'",
]) {
  assert.equal(
    validateDirectoryDeleteCommand(command, 'powershell.exe', cwd).detected,
    false,
    command,
  );
}

for (const command of [
  'echo rmdir /s /q D:\\temp',
  'call echo rmdir /s /q D:\\temp',
  'dir rmdir',
  'powershell.exe -Command "Write-Output ready"',
  'powershell.exe -Command "Write-Output rmdir"',
  'powershell.exe -NoProfile -NonInteractive -Command "Write-Output rmdir"',
]) {
  assert.equal(validateDirectoryDeleteCommand(command, 'cmd.exe', cwd).detected, false, command);
}

assert.equal(
  validateDirectoryDeleteCommand('Remove-Item .\\temp.txt', 'powershell.exe', cwd).detected,
  false,
);
assert.equal(validateDirectoryDeleteCommand('echo ready', 'cmd.exe', cwd).detected, false);
assert.equal(validateDirectoryDeleteCommand('@', 'cmd.exe', cwd).detected, false);
assert.equal(validateDirectoryDeleteCommand('@ echo rd /s /q Z:\\', 'cmd.exe', cwd).detected, false);
assert.equal(
  validateDirectoryDeleteCommand('rm -rf /', '/bin/bash', cwd).detected,
  false,
);

console.log('Directory delete guard tests passed.');
