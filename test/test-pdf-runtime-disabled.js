import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  editPdf,
  ensureChromeAvailable,
  parseMarkdownToPdf,
  parsePdfToMarkdown,
} from '../dist/tools/pdf/index.js';

const indexSource = await fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const pdfSource = await fs.readFile(new URL('../src/tools/pdf/index.ts', import.meta.url), 'utf8');

assert.equal(indexSource.includes('ensureChromeAvailable'), false);
assert.equal(pdfSource.includes('md-to-pdf'), false);
assert.equal(pdfSource.includes('pdf-lib'), false);
assert.equal(pdfSource.includes('@opendocsg/pdf2md'), false);
assert.equal(ensureChromeAvailable(), undefined);

await assert.rejects(parsePdfToMarkdown('example.pdf'), /not available/i);
await assert.rejects(parseMarkdownToPdf('# example'), /not available/i);
await assert.rejects(editPdf('example.pdf', []), /not available/i);

console.log('PDF runtime removal contract passed');
