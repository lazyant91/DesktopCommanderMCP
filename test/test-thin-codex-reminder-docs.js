import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const source = read('src/tools/improved-process-tools.ts');
const types = read('src/types.ts');
const terminalManager = read('src/terminal-manager.ts');

assert.doesNotMatch(types, /TerminalSessionKind|sessionKind/);
assert.doesNotMatch(terminalManager, /classifyTerminalSession|sessionKind/);

const interactStart = source.indexOf('export async function interactWithProcess');
const interactEnd = source.indexOf('export async function forceTerminate');
assert.ok(interactStart >= 0 && interactEnd > interactStart);
assert.doesNotMatch(source.slice(interactStart, interactEnd), /Codex|codex-reminder/);

const readme = read('README.md');
const security = read('SECURITY.md');
const changelog = read('CHANGELOG.md');

for (const document of [readme, security]) {
  assert.match(document, /thin accidental-use stop line/i);
  assert.match(document, /not a complete block|not a sandbox|not a security boundary/i);
  assert.match(document, /start_process/);
  assert.match(document, /interact_with_process.*not|does not inspect.*interact_with_process/is);
  assert.match(document, /chained|multiline/i);
  assert.match(document, /alias|wrapper/i);
}

assert.match(changelog, /thin Codex/i);
assert.doesNotMatch(readme, /recognized owned interactive shells/i);
assert.doesNotMatch(security, /recognized owned interactive shells/i);

console.log('Thin Codex reminder documentation and scope contract passed.');
