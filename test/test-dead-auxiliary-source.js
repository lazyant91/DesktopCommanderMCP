import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

for (const removedPath of [
  '../src/utils/open-browser.ts',
  '../src/types/caffeinate.d.ts',
]) {
  await assert.rejects(
    fs.access(new URL(removedPath, import.meta.url)),
    undefined,
    `dead auxiliary source still exists: ${removedPath}`,
  );
}

const configSource = await fs.readFile(new URL('../src/config.ts', import.meta.url), 'utf8');
assert.equal(configSource.includes('TOOL_CALL_FILE'), false);
assert.equal(configSource.includes('TOOL_CALL_FILE_MAX_SIZE'), false);

const textSource = await fs.readFile(new URL('../src/utils/files/text.ts', import.meta.url), 'utf8');
for (const staleTerm of [
  'editRange()',
  'ExcelFileHandler',
  'fuzzy search/replace',
  'writeFile telemetry',
]) {
  assert.equal(textSource.includes(staleTerm), false, `stale text-handler term remains: ${staleTerm}`);
}

console.log('Dead auxiliary source contract passed');
