import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(path.dirname(__dirname));
const distIndex = path.join(projectRoot, 'dist', 'index.js');
const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-mcp-edit-performance-'));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [distIndex],
  cwd: projectRoot,
  stderr: 'pipe',
});
const client = new Client(
  { name: 'local-mcp-edit-performance-test', version: '1.0.0' },
  { capabilities: {} },
);

async function callTool(name, args) {
  const result = await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout: 60_000 },
  );
  assert.equal(result.isError, undefined, `${name} returned an error: ${JSON.stringify(result)}`);
  return result;
}

function buildFixture(workflowId) {
  const lines = [`# Workflow ${workflowId}`, ''];
  for (let line = 1; line <= 600; line += 1) {
    lines.push(
      line === 300
        ? `TARGET_${workflowId}: original value`
        : `Line ${line}: retained text edit performance fixture for ${workflowId}`,
    );
  }
  return lines.join('\n');
}

try {
  await client.connect(transport);
  await callTool('set_config_value', {
    key: 'allowedDirectories',
    value: [testDir],
  });
  await callTool('set_config_value', {
    key: 'fileWriteLineLimit',
    value: 1000,
  });
  await callTool('set_config_value', {
    key: 'fileReadLineLimit',
    value: 400,
  });

  const startedAt = performance.now();
  const workflowCount = 8;

  await Promise.all(
    Array.from({ length: workflowCount }, async (_, index) => {
      const workflowId = String(index + 1).padStart(2, '0');
      const filePath = path.join(testDir, `workflow-${workflowId}.md`);
      const original = `TARGET_${workflowId}: original value`;
      const replacement = `TARGET_${workflowId}: updated value`;

      await callTool('write_file', {
        path: filePath,
        content: buildFixture(workflowId),
        mode: 'rewrite',
      });
      await callTool('edit_block', {
        file_path: filePath,
        old_string: original,
        new_string: replacement,
        expected_replacements: 1,
      });
      const readResult = await callTool('read_file', {
        path: filePath,
        offset: 295,
        length: 20,
      });
      const text = readResult.content.map((item) => item.text ?? '').join('\n');
      assert.equal(text.includes(replacement), true);
      assert.equal(text.includes(original), false);
    }),
  );

  const elapsed = performance.now() - startedAt;
  assert.equal(elapsed < 120_000, true, `text edit workflows took ${elapsed.toFixed(0)}ms`);
  console.log(`Text edit performance contract passed in ${elapsed.toFixed(0)}ms`);
} finally {
  await client.close().catch(() => {});
  await fs.rm(testDir, { recursive: true, force: true });
}
