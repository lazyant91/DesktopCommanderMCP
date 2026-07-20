import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.name, '@lazyant91/local-mcp-server');
assert.equal(packageJson.version, '0.1.0');
assert.equal(packageJson.mcpName, 'io.github.lazyant91/local-mcp-server');
assert.deepEqual(packageJson.bin, { 'local-mcp-server': 'dist/index.js' });
assert.equal(packageJson.repository.url, 'https://github.com/lazyant91/DesktopCommanderMCP.git');

for (const sourcePath of ['../src/server.ts', '../src/index.ts', '../src/utils/logger.ts']) {
  const source = await fs.readFile(new URL(sourcePath, import.meta.url), 'utf8');
  assert.equal(source.includes('local-mcp-server'), true, `${sourcePath} lacks Local MCP identity`);
  assert.equal(source.includes('desktop-commander'), false, `${sourcePath} retains old server identity`);
}

const versionSource = await fs.readFile(new URL('../src/version.ts', import.meta.url), 'utf8');
assert.equal(versionSource.includes("VERSION = '0.1.0'"), true);

const configSource = await fs.readFile(new URL('../src/config.ts', import.meta.url), 'utf8');
assert.equal(configSource.includes("'.local-mcp-server'"), true);
assert.equal(configSource.includes("'.claude-server-commander'"), false);

for (const documentPath of ['../README.md', '../FAQ.md', '../SECURITY.md']) {
  const content = await fs.readFile(new URL(documentPath, import.meta.url), 'utf8');
  for (const forbiddenTerm of [
    'Remote MCP',
    'Tunnel Client',
    'mcp-junction',
    'Claude Desktop Commander',
    'desktopcommander.app',
    'Buy Me A Coffee',
    'Discord',
    'Docker installation',
  ]) {
    assert.equal(content.includes(forbiddenTerm), false, `${documentPath} contains ${forbiddenTerm}`);
  }
}

await fs.access(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url));

console.log('Standalone Local MCP identity contract passed');
