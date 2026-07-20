import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const processSource = await fs.readFile(
  new URL('../src/tools/improved-process-tools.ts', import.meta.url),
  'utf8',
);

for (const removedTerm of [
  'node:local',
  'virtualNodeSessions',
  'virtualPidCounter',
  'executeNodeCode',
  '.mcp-exec-',
  "from 'child_process'",
  "from 'fs/promises'",
  "from 'path'",
  "from 'url'",
  'ExcelJS',
]) {
  assert.equal(processSource.includes(removedTerm), false, `virtual session term remains: ${removedTerm}`);
}

for (const retainedTerm of [
  'terminalManager.executeCommand',
  'terminalManager.readOutputPaginated',
  'terminalManager.sendInputToProcess',
  'terminalManager.forceTerminate',
  'terminalManager.listActiveSessions',
]) {
  assert.equal(processSource.includes(retainedTerm), true, `owned session path missing: ${retainedTerm}`);
}

const packageJson = JSON.parse(
  await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
assert.equal('exceljs' in packageJson.dependencies, false);

console.log('Owned terminal session source contract passed');
