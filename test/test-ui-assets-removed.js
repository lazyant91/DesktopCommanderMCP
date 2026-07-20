import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function assertMissing(relativePath) {
  await assert.rejects(
    fs.access(new URL(`../${relativePath}`, import.meta.url)),
    (error) => error && error.code === 'ENOENT',
    `${relativePath} must be removed`,
  );
}

const packageJson = JSON.parse(
  await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

assert.equal(packageJson.scripts.build.includes('build-ui-runtime'), false);
await assertMissing('src/ui');
await assertMissing('scripts/build-ui-runtime.cjs');
await assertMissing('test/test-ui-event-tracking.js');
await assertMissing('test/test-markdown-preview.js');

console.log('UI asset removal contract passed');
