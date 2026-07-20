import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

for (const removedPath of [
  '../src/search-manager.ts',
  '../src/handlers/search-handlers.ts',
  '../src/handlers/process-handlers.ts',
  '../src/tools/process.ts',
  '../test/test-literal-search.js',
  '../test/test_improved_search_truncation.js',
  '../test/test_search_truncation.js',
]) {
  await assert.rejects(
    fs.access(new URL(removedPath, import.meta.url)),
    undefined,
    `dead runtime compatibility source still exists: ${removedPath}`,
  );
}

const handlerIndexSource = await fs.readFile(
  new URL('../src/handlers/index.ts', import.meta.url),
  'utf8',
);
assert.equal(handlerIndexSource.includes("from './search-handlers.js'"), false);
assert.equal(handlerIndexSource.includes("from './process-handlers.js'"), false);

const schemasSource = await fs.readFile(new URL('../src/tools/schemas.ts', import.meta.url), 'utf8');
for (const removedSchema of [
  'ListProcessesArgsSchema',
  'KillProcessArgsSchema',
  'StartSearchArgsSchema',
  'GetMoreSearchResultsArgsSchema',
  'StopSearchArgsSchema',
  'ListSearchesArgsSchema',
]) {
  assert.equal(schemasSource.includes(removedSchema), false, `legacy schema remains: ${removedSchema}`);
}

console.log('Search and global process source removal contract passed');
