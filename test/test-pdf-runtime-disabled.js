import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

await assert.rejects(
  fs.access(new URL('../src/tools/pdf/index.ts', import.meta.url)),
  undefined,
  'PDF compatibility source still exists',
);

const schemasSource = await fs.readFile(new URL('../src/tools/schemas.ts', import.meta.url), 'utf8');
for (const removedSchema of [
  'PdfInsertOperationSchema',
  'PdfDeleteOperationSchema',
  'PdfOperationSchema',
  'WritePdfArgsSchema',
]) {
  assert.equal(schemasSource.includes(removedSchema), false, `PDF schema remains: ${removedSchema}`);
}

const indexSource = await fs.readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
assert.equal(indexSource.includes('tools/pdf'), false);
assert.equal(indexSource.includes('ensureChromeAvailable'), false);

console.log('PDF source removal contract passed');
