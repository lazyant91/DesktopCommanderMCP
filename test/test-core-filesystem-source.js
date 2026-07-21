import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/tools/filesystem.ts', import.meta.url), 'utf8');

for (const removedTerm of [
  'cross-fetch',
  'readFileFromUrl',
  'searchManager',
  'searchFiles',
  'writePdf',
  'parsePdfToMarkdown',
  'parseMarkdownToPdf',
  'editPdf',
  'PdfOperations',
  'execFile',
  'ripgrep',
  'capture(',
]) {
  assert.equal(source.includes(removedTerm), false, `unexpected filesystem term: ${removedTerm}`);
}

assert.equal(
  source.includes('Promise<Record<string, unknown>>'),
  false,
  'getFileInfo must expose a typed metadata contract to callers',
);
assert.equal(
  source.includes('export interface LocalFileInfo'),
  true,
  'getFileInfo must export its typed metadata contract',
);

for (const retainedExport of [
  'validatePath',
  'readFile',
  'readFileInternal',
  'writeFile',
  'createDirectory',
  'listDirectory',
  'moveFile',
  'getFileInfo',
]) {
  assert.equal(
    source.includes(`export async function ${retainedExport}`),
    true,
    `missing retained export: ${retainedExport}`,
  );
}

console.log('Core filesystem source contract passed');
