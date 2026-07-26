import assert from 'node:assert/strict';
import fs from 'node:fs';

import { getChatGPTProjectInstructions } from '../dist/tools/chatgpt-project-instructions.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const projectTemplate = read('docs/templates/chatgpt-project-instructions-template.md');
const source = read('src/tools/improved-process-tools.ts');
const types = read('src/types.ts');
const terminalManager = read('src/terminal-manager.ts');

const templateResult = await getChatGPTProjectInstructions({ mode: 'template' });
assert.equal(templateResult.isError, undefined);
const writingStart = ':::writing{variant="document"}\n';
const writingEnd = '\n:::';
const runtimeTemplate = templateResult.content[0].text;
assert.ok(runtimeTemplate.startsWith(writingStart));
assert.ok(runtimeTemplate.endsWith(writingEnd));
assert.equal(
  projectTemplate.trim(),
  runtimeTemplate.slice(writingStart.length, -writingEnd.length).trim(),
);
assert.match(projectTemplate, /프로젝트 이름: \[PROJECT_NAME\]/);
assert.match(projectTemplate, /GitHub 저장소: \[REPOSITORY_OWNER\/REPOSITORY_NAME\]/);
assert.match(projectTemplate, /기본 로컬 작업공간: \[WORKSPACE_ROOT\]/);
assert.match(projectTemplate, /Inline Execution/);
assert.match(projectTemplate, /1차 가드레일/);
assert.match(projectTemplate, /2차 가드레일/);
assert.match(projectTemplate, /AGENTS\.md를 자동 생성하거나 수정하지 않는다/);
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

assert.match(readme, /get_chatgpt_project_instructions/);
assert.match(readme, /optional/i);
assert.match(readme, /recommended/i);
assert.match(readme, /:::writing\{variant="document"\}/);
assert.match(changelog, /ChatGPT project instructions/i);
assert.match(changelog, /thin Codex/i);
assert.doesNotMatch(readme, /recognized owned interactive shells/i);
assert.doesNotMatch(security, /recognized owned interactive shells/i);

console.log('Thin Codex reminder documentation and scope contract passed.');
