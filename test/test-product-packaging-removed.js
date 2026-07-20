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
const indexSource = await fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

assert.deepEqual(packageJson.bin, {
  'desktop-commander': 'dist/index.js',
});

for (const removedScript of [
  'postinstall',
  'open-chat',
  'sync-version',
  'bump',
  'bump:minor',
  'bump:major',
  'setup',
  'setup:debug',
  'remove',
  'build:mcpb',
  'release',
  'release:minor',
  'release:major',
  'release:dry',
  'release:mcp',
  'release:alpha',
  'release:skip-mcp',
  'logs:view',
  'logs:analyze',
  'logs:clear',
  'logs:export',
  'count-tokens',
  'count-tokens:json',
]) {
  assert.equal(removedScript in packageJson.scripts, false, `unexpected script: ${removedScript}`);
}

assert.equal(packageJson.scripts.build, 'tsc');
assert.equal(indexSource.includes('runSetup'), false);
assert.equal(indexSource.includes('runUninstall'), false);
assert.equal(indexSource.includes("process.argv[2] === 'setup'"), false);
assert.equal(indexSource.includes("process.argv[2] === 'remove'"), false);

for (const removedPath of [
  'src/npm-scripts',
  'setup-claude-server.js',
  'uninstall-claude-server.js',
  'scripts/build-mcpb.cjs',
  'scripts/publish-release.cjs',
  'scripts/sync-version.js',
  'scripts/view-fuzzy-logs.js',
  'scripts/analyze-fuzzy-logs.js',
  'scripts/clear-fuzzy-logs.js',
  'scripts/export-fuzzy-logs.js',
  'scripts/count-tokens.js',
  'PUBLISH.md',
  'manifest.template.json',
  'plugins',
  'skills',
  'testemonials',
  'logo.png',
]) {
  await assertMissing(removedPath);
}

console.log('Product packaging removal contract passed');
