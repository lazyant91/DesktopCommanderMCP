import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

await assert.rejects(
  fs.access(new URL('../smithery.yaml', import.meta.url)),
  undefined,
  'service-specific Smithery configuration remains',
);

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
  'npm run build',
  'npm test',
  'Review passed: YES',
  'GitHub Actions',
  'final local validation',
]) {
  assert.equal(contributing.includes(requiredTerm), true, `contributing guide lacks ${requiredTerm}`);
}

console.log('Repository development surface contract passed');
