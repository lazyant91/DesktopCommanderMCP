import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function assertMissing(relativePath) {
  await assert.rejects(
    fs.access(new URL(`../${relativePath}`, import.meta.url)),
    (error) => error && error.code === 'ENOENT',
    `${relativePath} must be removed from the standalone repository surface`,
  );
}

for (const removedPath of [
  'smithery.yaml',
  'CLINE_NOTIFICATION_PROBLEM.md',
  'CUSTOM_STDIO_EXPLANATION.md',
  'install.sh',
  'install-docker.sh',
  'install-docker.ps1',
  'server.json',
  'server.yaml',
  'plugin.yaml',
  'gemini-extension.json',
  'config.json',
  'header.png',
  'icon.png',
  '1080_60.mp4',
  'test-listener-bug.js',
  '.claude',
  '.claude-plugin',
  '.cursor-plugin',
  'rules',
  'screenshots',
]) {
  await assertMissing(removedPath);
}

for (const documentPath of ['../CONTRIBUTING.md', '../.gitignore', '../.npmignore']) {
  const content = await fs.readFile(new URL(documentPath, import.meta.url), 'utf8');
  for (const removedTerm of [
    'desktopcommander.app',
    'Desktop Commander Team',
    'setup-claude-server.js',
    'MCPB related files',
    '.ripgrep-downloads',
    'mcpregistry',
  ]) {
    assert.equal(content.includes(removedTerm), false, `${documentPath} contains ${removedTerm}`);
  }
}

const contributing = await fs.readFile(new URL('../CONTRIBUTING.md', import.meta.url), 'utf8');
for (const requiredTerm of [
  'Local MCP Server',
  'npm ci',
  'npm run build',
  'npm test',
  'Review passed: YES',
  'GitHub Actions',
  'final local validation',
  'Release validation: PASS',
]) {
  assert.equal(contributing.includes(requiredTerm), true, `contributing guide lacks ${requiredTerm}`);
}

const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
for (const obsoleteClaim of [
  '@wonderwhy-er/desktop-commander@latest setup',
  'mcp/desktop-commander',
  'telemetryEnabled',
  'Google Analytics',
  'Docker installation',
]) {
  assert.equal(readme.includes(obsoleteClaim), false, `README contains obsolete claim: ${obsoleteClaim}`);
}

const lockfile = JSON.parse(await fs.readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
assert.equal(lockfile.name, '@lazyant91/local-mcp-server');
assert.equal(lockfile.version, '1.0.0');

console.log('Repository development surface contract passed');