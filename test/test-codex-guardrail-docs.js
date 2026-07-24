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
  assert.match(project, /(?:do|must) not change.*installation.*credentials.*configuration.*subscription/is);
  assert.match(block(reusable), /(?:do|must) not change.*installation.*credentials.*configuration.*subscription/is);
  assert.match(project, /both markers are present/i);
  assert.match(project, /only one marker is present/i);
  assert.match(project, /before.*file mutation.*Git.*build.*test.*process/is);
  assert.doesNotMatch(project, /DesktopCommanderMCP|mcp-junction|D:\\AI\\MCP/);

  assert.match(readme, /Codex CLI reminder guardrail/i);
  assert.match(readme, /Inline Execution/);
  assert.match(readme, /human operator.*directly/i);
  assert.match(readme, /not a sandbox/i);
  assert.match(readme, /does not attempt to detect renamed|does not detect renamed/i);
  assert.match(readme, /recognized owned interactive shells.*cmd.*PowerShell.*pwsh.*bash.*sh.*zsh/is);
  assert.match(readme, /environment-variable assignment prefixes/i);
  assert.match(readme, /origin metadata.*every matching Local MCP|every matching Local MCP.*origin metadata/is);
  assert.match(readme, /npx.*(?:-y|--yes).*npm (?:exec|x).*optional `--`/is);
  assert.match(readme, /@openai\/codex@.*version|version.*@openai\/codex@|dist-tag/is);
  assert.match(readme, /CMD.*single leading `@`|single leading `@`.*CMD/is);
  assert.match(readme, /CMD.*first.*(?:\/c|\/k).*(?:host|mode)|(?:\/c|\/k).*first.*CMD/is);
  assert.match(readme, /ExecutionPolicy.*WorkingDirectory.*InputFormat.*OutputFormat/is);
  assert.match(readme, /(?:-Command|-File).*stdin.*exactly `-`|exactly `-`.*(?:-Command|-File).*stdin/is);
  assert.match(readme, /-NoExit.*before.*execution target|execution target.*before.*-NoExit/is);
  assert.match(readme, /POSIX shell.*value-consuming|value-consuming.*POSIX shell/is);
  assert.match(readme, /bash.*sh.*zsh.*`-s`.*stdin|`-s`.*stdin.*bash.*sh.*zsh/is);
  assert.match(readme, /backtick.*caret.*heredoc/is);
  assert.match(readme, /backslash.*segment separator|segment separator.*backslash/is);
  assert.match(readme, /double quotes.*segment separator.*single quotes|single quotes.*double quotes.*segment separator/is);
  assert.doesNotMatch(readme, /same commands sent to an owned interactive shell\./i);

  assert.match(security, /Codex CLI reminder/i);
  assert.match(security, /workflow guardrail/i);
  assert.match(security, /not a security boundary|not a sandbox/i);
  assert.match(security, /origin metadata/i);
  assert.match(security, /human-direct/i);
  assert.doesNotMatch(security, /Remote-origin/i);

  assert.match(changelog, /## \[Unreleased\]/);
  assert.match(changelog, /Codex CLI/i);
  assert.match(changelog, /Inline Execution/i);
  console.log('Codex guardrail documentation contract passed.');
}

run().catch((error) => { console.error(error); process.exit(1); });
