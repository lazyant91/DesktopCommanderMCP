import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { configManager } from '../dist/config-manager.js';
import { getFileInfo, readFile, writeFile } from '../dist/tools/filesystem.js';
import { BinaryFileHandler } from '../dist/utils/files/binary.js';
import { getFileHandler } from '../dist/utils/files/factory.js';
import { TextFileHandler } from '../dist/utils/files/text.js';

const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-mcp-files-'));
const textFile = path.join(testDir, 'sample.txt');
const jsonFile = path.join(testDir, 'sample.json');
const originalConfig = await configManager.getConfig();

try {
  await configManager.setValue('allowedDirectories', [testDir]);

  assert.equal((await getFileHandler(textFile)) instanceof TextFileHandler, true);
  for (const binaryName of ['sample.pdf', 'sample.docx', 'sample.xlsx', 'sample.png']) {
    assert.equal(
      (await getFileHandler(path.join(testDir, binaryName))) instanceof BinaryFileHandler,
      true,
    );
  }

  const text = 'Line 1\nLine 2\nLine 3\nSpecial: äöü 한글';
  await writeFile(textFile, text);
  const fullRead = await readFile(textFile);
  assert.equal(fullRead.content.toString().includes('Special: äöü 한글'), true);

  const partialRead = await readFile(textFile, { offset: 1, length: 2 });
  assert.equal(partialRead.content.toString().includes('Line 2'), true);
  assert.equal(partialRead.content.toString().includes('Line 3'), true);

  const data = { name: 'core', values: [1, 2, 3] };
  await writeFile(jsonFile, JSON.stringify(data, null, 2));
  const jsonRead = (await readFile(jsonFile)).content.toString();
  assert.equal(jsonRead.includes('"name": "core"'), true);

  const info = await getFileInfo(textFile);
  assert.equal(info.isFile, true);
  assert.equal(info.size > 0, true);
} finally {
  await configManager.updateConfig(originalConfig);
  await fs.rm(testDir, { recursive: true, force: true });
}

console.log('Core file handler contract passed');
