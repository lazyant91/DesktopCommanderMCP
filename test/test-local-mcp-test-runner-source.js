import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('./run-all-tests.js', import.meta.url), 'utf8');
const integrationSource = await fs.readFile(
  new URL('./integration/run-all-integration-tests.js', import.meta.url),
  'utf8',
);

for (const requiredTerm of [
  'LOCAL MCP TEST RUNNER',
  "npm', ['run', 'build']",
  "file.startsWith('test')",
  "file.endsWith('.js')",
  "file !== 'run-all-tests.js'",
  "spawn('node', [testFile]",
  'process.exit(testResult.success ? 0 : 1)',
]) {
  assert.equal(source.includes(requiredTerm), true, `test runner lacks ${requiredTerm}`);
}

for (const removedTerm of ['DESKTOP COMMANDER', 'magenta', 'reason, promise']) {
  assert.equal(source.includes(removedTerm), false, `stale test-runner term remains: ${removedTerm}`);
}

for (const [runnerName, runnerSource] of [
  ['unit', source],
  ['integration', integrationSource],
]) {
  for (const requiredTerm of [
    'snapshotLocalConfig',
    'restoreLocalConfig',
    "'.local-mcp-server'",
  ]) {
    assert.equal(
      runnerSource.includes(requiredTerm),
      true,
      `${runnerName} runner lacks config isolation: ${requiredTerm}`,
    );
  }
}

console.log('Local MCP test runner source contract passed');
