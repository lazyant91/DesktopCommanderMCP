import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { BinaryFileHandler } from '../dist/utils/files/binary.js';
import { TextFileHandler } from '../dist/utils/files/text.js';
import {
  getFileHandler,
  isExcelFile,
  isImageFile,
} from '../dist/utils/files/factory.js';

for (const filePath of [
  'sample.pdf',
  'sample.docx',
  'sample.xlsx',
  'sample.xls',
  'sample.xlsm',
  'sample.png',
  'sample.jpg',
  'sample.jpeg',
  'sample.gif',
  'sample.webp',
]) {
  const handler = await getFileHandler(filePath);
  assert.equal(handler instanceof BinaryFileHandler, true, `${filePath} must use BinaryFileHandler`);
  await assert.rejects(handler.write(filePath, 'content'), /binary files directly/i);
  const editResult = await handler.editRange(filePath, '', 'content');
  assert.equal(editResult.success, false);
}

assert.equal((await getFileHandler('sample.txt')) instanceof TextFileHandler, true);
assert.equal(isExcelFile('sample.xlsx'), true);
assert.equal(isExcelFile('sample.txt'), false);
assert.equal(isImageFile('sample.png'), true);
assert.equal(isImageFile('sample.txt'), false);

const factorySource = await fs.readFile(new URL('../src/utils/files/factory.ts', import.meta.url), 'utf8');
for (const removedImport of ['./excel.js', './image.js', './docx.js', './pdf.js']) {
  assert.equal(factorySource.includes(removedImport), false);
}

console.log('Binary specialization removal contract passed');
