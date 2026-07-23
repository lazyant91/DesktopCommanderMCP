import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [readme, security, changelog, design, packageJsonText] = await Promise.all([
  fs.readFile(new URL('../README.md', import.meta.url), 'utf8'),
  fs.readFile(new URL('../SECURITY.md', import.meta.url), 'utf8'),
  fs.readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'),
  fs.readFile(
    new URL('../docs/superpowers/specs/2026-07-23-local-ai-cli-blocking-design.md', import.meta.url),
    'utf8',
  ),
  fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
]);

const combinedDocs = `${readme}\n${security}\n${design}`.toLowerCase();

for (const required of [
  'immutable ai agent cli policy',
  'blockedcommands cannot disable',
  'codex',
  'opencode',
  'claude',
  'gemini',
  'aider',
  'cursor-agent',
  'renamed binaries',
  'outside local mcp',
  'repl data',
  'plain prose',
  'process-launch api',
  'shell override',
  'defaultshell',
  'ordinary project directories',
  '64 kib',
]) {
  assert.ok(combinedDocs.includes(required), `missing documentation phrase: ${required}`);
}

for (const required of [
  'git',
  'npm',
  'build',
  'test',
  'not an operating-system sandbox',
]) {
  assert.ok(combinedDocs.includes(required), `missing policy boundary: ${required}`);
}

assert.match(changelog, /^## \[Unreleased\]/m);
assert.match(changelog, /immutable local mcp execution policy/i);
assert.match(changelog, /shell selection/i);
assert.match(changelog, /process-launch APIs/i);
assert.match(changelog, /repl data/i);

const packageJson = JSON.parse(packageJsonText);
assert.equal(packageJson.version, '1.0.0', 'feature must not change the package version');

console.log('Immutable AI agent policy documentation contract passed');
