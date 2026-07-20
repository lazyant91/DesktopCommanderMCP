import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/utils/capture.ts', import.meta.url), 'utf8');

for (const removedTerm of [
  'AsyncLocalStorage',
  'sanitizeError',
  'captureBase',
  'capture_call_tool',
  'capture_ui_event',
  'captureRemote',
  'isTelemetryDisabledByEnv',
  'runInUiOriginCallContext',
  'isInsideUiOriginCall',
  'https',
  'fetch(',
]) {
  assert.equal(source.includes(removedTerm), false, `obsolete event term remains: ${removedTerm}`);
}

assert.equal(source.includes('export async function capture'), true);
assert.equal(source.split('\n').length <= 12, true, 'event compatibility boundary is not minimal');

console.log('Inert event boundary contract passed');
