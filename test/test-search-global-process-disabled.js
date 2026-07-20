import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  handleListProcesses,
  handleKillProcess,
} from '../dist/handlers/process-handlers.js';
import {
  handleStartSearch,
  handleGetMoreSearchResults,
  handleStopSearch,
  handleListSearches,
} from '../dist/handlers/search-handlers.js';
import { searchManager } from '../dist/search-manager.js';

for (const result of [
  await handleListProcesses(),
  await handleKillProcess({ pid: process.pid }),
  await handleStartSearch({ path: '.', pattern: 'needle', searchType: 'content' }),
  await handleGetMoreSearchResults({ sessionId: 'missing' }),
  await handleStopSearch({ sessionId: 'missing' }),
  await handleListSearches(),
]) {
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text.includes('not available'), true);
}

await assert.rejects(
  searchManager.startSearch({ rootPath: '.', pattern: 'needle', searchType: 'content' }),
  /not available/i,
);
assert.deepEqual(searchManager.listSearchSessions(), []);
assert.equal(searchManager.terminateSearch('missing'), false);

const processSource = await fs.readFile(new URL('../src/tools/process.ts', import.meta.url), 'utf8');
const searchSource = await fs.readFile(new URL('../src/search-manager.ts', import.meta.url), 'utf8');
assert.equal(processSource.includes('process.kill'), false);
assert.equal(processSource.includes('tasklist'), false);
assert.equal(processSource.includes('ps aux'), false);
assert.equal(searchSource.includes('child_process'), false);
assert.equal(searchSource.includes('ripgrep'), false);
assert.equal(searchSource.includes('PizZip'), false);

console.log('Search and global process removal contract passed');
