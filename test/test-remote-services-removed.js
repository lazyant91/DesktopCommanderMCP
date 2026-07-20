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

for (const scriptName of Object.keys(packageJson.scripts)) {
  assert.equal(scriptName.startsWith('device:'), false, `unexpected remote device script: ${scriptName}`);
}
assert.equal(packageJson.scripts.build.includes('remote-device'), false);
assert.equal(indexSource.includes("./npm-scripts/remote.js"), false);
assert.equal(indexSource.includes("process.argv[2] === 'remote'"), false);

await assertMissing('src/npm-scripts/remote.ts');
await assertMissing('src/remote-device');
await assertMissing('test/test-remote-channel-reconnect.js');

console.log('Remote service removal contract passed');
