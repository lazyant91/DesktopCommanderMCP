import assert from 'node:assert/strict';

import { getChatGPTProjectInstructions } from '../dist/tools/chatgpt-project-instructions.js';

const WRITING_START = ':::writing{variant="document"}';

function textOf(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  return result.content[0].text;
}

const guide = await getChatGPTProjectInstructions({});
const guideText = textOf(guide);
assert.equal(guide.isError, undefined);
assert.match(guideText, /1\.\s*빈 템플릿/);
assert.match(guideText, /2\.\s*프로젝트 정보를 입력해 완성본 만들기/);
assert.match(guideText, /프로젝트 이름/);
assert.match(guideText, /GitHub 저장소/);
assert.match(guideText, /기본 로컬 작업공간/);
assert.match(guideText, /최종 확인/);

const template = await getChatGPTProjectInstructions({ mode: 'template' });
const templateText = textOf(template);
assert.equal(template.isError, undefined);
assert.ok(templateText.startsWith(`${WRITING_START}\n`));
assert.ok(templateText.endsWith('\n:::'));
assert.match(templateText, /\[PROJECT_NAME\]/);
assert.match(templateText, /\[REPOSITORY_OWNER\/REPOSITORY_NAME\]/);
assert.match(templateText, /\[WORKSPACE_ROOT\]/);
assert.match(templateText, /AGENTS\.md를 자동 생성하거나 수정하지 않는다/);

const missing = await getChatGPTProjectInstructions({
  mode: 'generate',
  project_name: 'VibeTutor',
});
const missingText = textOf(missing);
assert.equal(missing.isError, true);
assert.match(missingText, /GitHub 저장소/);
assert.match(missingText, /기본 로컬 작업공간/);
assert.match(missingText, /lazyant91\/VibeTutor/);
assert.match(missingText, /D:\\AI\\VibeTutor/);

const unconfirmed = await getChatGPTProjectInstructions({
  mode: 'generate',
  project_name: 'VibeTutor',
  github_repository: 'lazyant91/VibeTutor',
  workspace_root: 'D:\\AI\\VibeTutor',
});
const unconfirmedText = textOf(unconfirmed);
assert.equal(unconfirmed.isError, true);
assert.match(unconfirmedText, /최종 확인/);
assert.match(unconfirmedText, /confirmed/);
assert.match(unconfirmedText, /VibeTutor/);
assert.match(unconfirmedText, /lazyant91\/VibeTutor/);
assert.match(unconfirmedText, /D:\\AI\\VibeTutor/);

const generated = await getChatGPTProjectInstructions({
  mode: 'generate',
  project_name: 'VibeTutor',
  github_repository: 'lazyant91/VibeTutor',
  workspace_root: 'D:\\AI\\VibeTutor',
  confirmed: true,
});
const generatedText = textOf(generated);
assert.equal(generated.isError, undefined);
assert.ok(generatedText.startsWith(`${WRITING_START}\n`));
assert.ok(generatedText.endsWith('\n:::'));
assert.match(generatedText, /프로젝트 이름: VibeTutor/);
assert.match(generatedText, /GitHub 저장소: lazyant91\/VibeTutor/);
assert.match(generatedText, /기본 로컬 작업공간: D:\\AI\\VibeTutor/);
assert.doesNotMatch(generatedText, /\[PROJECT_NAME\]/);
assert.doesNotMatch(generatedText, /\[REPOSITORY_OWNER\/REPOSITORY_NAME\]/);
assert.doesNotMatch(generatedText, /\[WORKSPACE_ROOT\]/);

const invalid = await getChatGPTProjectInstructions({ mode: 'unsupported' });
assert.equal(invalid.isError, true);
assert.match(textOf(invalid), /Invalid arguments/);

console.log('ChatGPT project instructions tool contract passed.');
