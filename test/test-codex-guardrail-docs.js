import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const begin = '<!-- CHATGPT-REMOTE-ONLY:BEGIN -->';
const end = '<!-- CHATGPT-REMOTE-ONLY:END -->';
const count = (text, needle) => text.split(needle).length - 1;

function block(text) {
  assert.equal(count(text, begin), 1);
  assert.equal(count(text, end), 1);
  const start = text.indexOf(begin);
  const finish = text.indexOf(end) + end.length;
  assert.ok(start >= 0 && finish > start);
  return text.slice(start, finish).trim();
}

async function run() {
  const [agents, reusable, project, readme, security, changelog] = await Promise.all([
    fs.readFile(path.join(root, 'AGENTS.md'), 'utf8'),
    fs.readFile(path.join(root, 'docs/templates/chatgpt-remote-only-agents-block.md'), 'utf8'),
    fs.readFile(path.join(root, 'docs/templates/chatgpt-project-instructions-template.md'), 'utf8'),
    fs.readFile(path.join(root, 'README.md'), 'utf8'),
    fs.readFile(path.join(root, 'SECURITY.md'), 'utf8'),
    fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8'),
  ]);
  assert.equal(block(agents), block(reusable));
  const opening = block(reusable).split(/\r?\n/).slice(0, 12).join('\n');
  assert.match(opening, /applies only to work initiated by web ChatGPT/i);
  assert.match(opening, /started directly by the human operator/i);
  assert.match(opening, /skip directly to `CHATGPT-REMOTE-ONLY:END`/i);
  assert.match(opening, /must not classify itself/i);
  for (const label of ['Project name:', 'GitHub repository:', 'Local workspace root:', 'Default branch:']) {
    assert.match(project, new RegExp(`- ${label}\\s*$`, 'm'));
  }
  assert.match(project, /Inline Execution/);
  assert.match(project, /do not recommend or select a local Codex CLI-backed Subagent/i);
  assert.match(project, /both markers are present/i);
  assert.match(project, /only one marker is present/i);
  assert.doesNotMatch(project, /DesktopCommanderMCP|mcp-junction|D:\\AI\\MCP/);

  assert.match(readme, /Codex CLI reminder guardrail/i);
  assert.match(readme, /Inline Execution/);
  assert.match(readme, /human operator.*directly/i);
  assert.match(readme, /not a sandbox/i);
  assert.match(readme, /does not attempt to detect renamed|does not detect renamed/i);
  assert.match(readme, /recognized owned interactive shells.*cmd.*PowerShell.*pwsh.*bash.*sh.*zsh/is);
  assert.match(readme, /environment-variable assignment prefixes/i);
  assert.match(readme, /ExecutionPolicy.*WorkingDirectory.*InputFormat.*OutputFormat/is);
  assert.match(readme, /POSIX shell.*value-consuming|value-consuming.*POSIX shell/is);
  assert.match(readme, /backtick.*caret.*heredoc/is);
  assert.doesNotMatch(readme, /same commands sent to an owned interactive shell\./i);

  assert.match(security, /Codex CLI reminder/i);
  assert.match(security, /workflow guardrail/i);
  assert.match(security, /not a security boundary|not a sandbox/i);
  assert.match(security, /human-direct/i);

  assert.match(changelog, /## \[Unreleased\]/);
  assert.match(changelog, /Codex CLI/i);
  assert.match(changelog, /Inline Execution/i);
  console.log('Codex guardrail documentation contract passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
