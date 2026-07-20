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

for (const removedPath of [
  'src/ui',
  'scripts/build-ui-runtime.cjs',
  'test/test-ui-event-tracking.js',
  'test/test-markdown-preview.js',
  'test/test-file-preview-image-runtime.js',
  'test/test-file-preview-directory-runtime.js',
  'test/test-widget-state-runtime.js',
  'test/test-markdown-editor-roundtrip.js',
  'test/test-markdown-editor-edit-diff.js',
]) {
  await assertMissing(removedPath);
}

console.log('UI asset removal contract passed');
