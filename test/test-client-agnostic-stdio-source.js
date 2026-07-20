import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/custom-stdio.ts', import.meta.url), 'utf8');

for (const requiredTerm of [
  'local-mcp-server',
  'messageBuffer',
  'enableNotifications',
  'setupConsoleRedirection',
  'setupStdoutFiltering',
  'originalStdoutWrite',
  'sendLog',
  'sendProgress',
  'sendCustomNotification',
  'cleanup',
]) {
  assert.equal(source.includes(requiredTerm), true, `missing transport term: ${requiredTerm}`);
}

for (const removedTerm of [
  'desktop-commander',
  'Desktop Commander',
  'configureForClient',
  'disableNotifications',
  'claude-dev',
  "includes('cline')",
  "includes('vscode')",
]) {
  assert.equal(source.includes(removedTerm), false, `client-specific transport term remains: ${removedTerm}`);
}

console.log('Client-agnostic stdio transport source contract passed');
