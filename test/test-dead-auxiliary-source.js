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

console.log('Dead auxiliary source contract passed');
