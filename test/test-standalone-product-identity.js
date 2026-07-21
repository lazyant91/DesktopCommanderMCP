import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(packageJson.name, '@lazyant91/local-mcp-server');
assert.equal(packageJson.version, '1.0.0');
assert.equal(packageJson.mcpName, 'io.github.lazyant91/local-mcp-server');
assert.deepEqual(packageJson.bin, { 'local-mcp-server': 'dist/index.js' });
assert.equal(packageJson.repository.url, 'https://github.com/lazyant91/DesktopCommanderMCP.git');
assert.equal(packageJson.files.includes('CHANGELOG.md'), true);

for (const sourcePath of ['../src/server.ts', '../src/index.ts', '../src/utils/logger.ts']) {
  const source = await fs.readFile(new URL(sourcePath, import.meta.url), 'utf8');
  assert.equal(source.includes('local-mcp-server'), true, `${sourcePath} lacks Local MCP identity`);
  assert.equal(source.includes('desktop-commander'), false, `${sourcePath} retains old server identity`);
}

const versionSource = await fs.readFile(new URL('../src/version.ts', import.meta.url), 'utf8');
assert.equal(versionSource.includes("VERSION = '1.0.0'"), true);

const configSource = await fs.readFile(new URL('../src/config.ts', import.meta.url), 'utf8');
assert.equal(configSource.includes("'.local-mcp-server'"), true);
assert.equal(configSource.includes("'.claude-server-commander'"), false);

for (const documentPath of [
  '../README.md',
  '../FAQ.md',
  '../SECURITY.md',
  '../PRIVACY.md',
  '../CONTRIBUTING.md',
  '../CHANGELOG.md',
  '../docs/STDIO_TRANSPORT.md',
]) {
  const content = await fs.readFile(new URL(documentPath, import.meta.url), 'utf8');
  for (const forbiddenTerm of [
    'Remote MCP',
    'Tunnel Client',
    'mcp-junction',
    'Claude Desktop Commander',
    'desktopcommander.app',
    'Buy Me A Coffee',
    'Google Analytics 4',
    'privacy@desktopcommander.app',
  ]) {
    assert.equal(content.includes(forbiddenTerm), false, `${documentPath} contains ${forbiddenTerm}`);
  }
}

const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
for (const requiredTerm of [
  '[![Release]',
  'Version **1.0.0**',
  'Why this fork exists',
  'wonderwhy-er/DesktopCommanderMCP',
  'Installation from source',
  'Public tools',
  'docs/STDIO_TRANSPORT.md',
]) {
  assert.equal(readme.includes(requiredTerm), true, `README lacks ${requiredTerm}`);
}
assert.equal(readme.includes('stdout is reserved for MCP JSON-RPC messages'), false);
assert.equal(readme.includes('Stdout is reserved for MCP JSON-RPC messages'), true);
assert.equal(readme.includes('MCP logging notifications'), true);

const privacy = await fs.readFile(new URL('../PRIVACY.md', import.meta.url), 'utf8');
assert.equal(privacy.includes('does not include telemetry'), true);
assert.equal(privacy.includes('telemetryEnabled'), false);
assert.equal(privacy.includes('Google Analytics'), false);

const stdio = await fs.readFile(new URL('../docs/STDIO_TRANSPORT.md', import.meta.url), 'utf8');
assert.equal(stdio.includes('local-mcp-server'), true);
assert.equal(stdio.includes('notifications/message'), true);
assert.equal(stdio.includes('Desktop Commander'), false);

const changelog = await fs.readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
assert.equal(changelog.includes('## [1.0.0] - 2026-07-21'), true);
assert.equal(changelog.includes('78f8f4b1cd35ccca8af4a1208f196a0466dc39b0'), true);

await fs.access(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url));

console.log('Standalone Local MCP identity contract passed');