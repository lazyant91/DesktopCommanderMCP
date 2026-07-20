import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const editSource = await fs.readFile(new URL('../src/tools/edit.ts', import.meta.url), 'utf8');
const handlerSource = await fs.readFile(
  new URL('../src/handlers/edit-search-handlers.ts', import.meta.url),
  'utf8',
);
const schemaSource = await fs.readFile(new URL('../src/tools/schemas.ts', import.meta.url), 'utf8');

for (const removedTerm of [
  'getDefaultEditorMetadata',
  'resolvePreviewFileType',
  'ui/file-preview',
  'runFuzzySearchInWorker',
  'fuzzySearchLogger',
  'capture(',
  'structuredContent',
  'editRange',
  'origin',
  'range + content',
]) {
  assert.equal(editSource.includes(removedTerm), false, `unexpected edit term: ${removedTerm}`);
}

for (const retainedTerm of [
  'PublicEditBlockArgsSchema',
  'readFileInternal',
  'writeFile',
  'detectLineEnding',
  'normalizeLineEndings',
  'expected_replacements',
  'Successfully applied',
]) {
  assert.equal(editSource.includes(retainedTerm), true, `missing retained edit term: ${retainedTerm}`);
}

assert.equal(handlerSource.includes('EditBlockArgsSchema'), false);
assert.equal(schemaSource.includes('export const EditBlockArgsSchema'), false);
assert.equal(schemaSource.includes('export const PublicEditBlockArgsSchema'), true);

for (const removedPath of [
  '../src/tools/fuzzySearch.ts',
  '../src/tools/fuzzySearchCore.ts',
  '../src/utils/fuzzySearchLogger.ts',
]) {
  await assert.rejects(fs.access(new URL(removedPath, import.meta.url)));
}

console.log('Core text-edit source contract passed');
