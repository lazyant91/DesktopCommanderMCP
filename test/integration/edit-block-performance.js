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

async function callTool(name, args, timeout = 60_000) {
  const result = await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout },
  );
  assert.notEqual(result.isError, true, `${name} returned an error: ${JSON.stringify(result)}`);
  return result;
}

function marker(workflowId, index, state) {
  return `TARGET_${workflowId}_${String(index).padStart(3, '0')}: ${state} value`;
}

function buildFixture(workflowId, editCount, language = 'markdown') {
  const lines = language === 'python'
    ? ['# generated Python edit fixture', `WORKFLOW = ${JSON.stringify(workflowId)}`, '']
    : [`# Workflow ${workflowId}`, ''];

  for (let index = 1; index <= editCount; index += 1) {
    lines.push(marker(workflowId, index, 'original'));
    lines.push(
      language === 'python'
        ? `VALUE_${index} = ${JSON.stringify(`context ${index} for ${workflowId}`)}`
        : `Context ${index}: retained text edit performance fixture for ${workflowId}`,
    );
  }

  for (let line = 1; line <= 900; line += 1) {
    lines.push(
      language === 'python'
        ? `EXTRA_${line} = ${JSON.stringify(`extra Python line ${line}`)}`
        : `Extra line ${line}: local MCP text editing remains responsive`,
    );
  }

  return lines.join('\n');
}

async function runSequentialEditWorkflow(workflowId, extension, editCount, language) {
  const filePath = path.join(testDir, `${workflowId}.${extension}`);
  await callTool('write_file', {
    path: filePath,
    content: buildFixture(workflowId, editCount, language),
    mode: 'rewrite',
  });

  for (let index = 1; index <= editCount; index += 1) {
    await callTool('edit_block', {
      file_path: filePath,
      old_string: marker(workflowId, index, 'original'),
      new_string: marker(workflowId, index, 'updated'),
      expected_replacements: 1,
    });

    if (index % 10 === 0) {
      await callTool('list_sessions', {});
    }
  }

  const persisted = await fs.readFile(filePath, 'utf8');
  for (let index = 1; index <= editCount; index += 1) {
    assert.equal(persisted.includes(marker(workflowId, index, 'updated')), true);
    assert.equal(persisted.includes(marker(workflowId, index, 'original')), false);
  }

  const readResult = await callTool('read_file', {
    path: filePath,
    offset: 0,
    length: 120,
  });
  const readText = readResult.content.map((item) => item.text ?? '').join('\n');
  assert.equal(readText.includes(marker(workflowId, 1, 'updated')), true);
}

async function runConcurrentFileWorkflows(count) {
  await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const workflowId = `concurrent-${String(index + 1).padStart(2, '0')}`;
      const filePath = path.join(testDir, `${workflowId}.md`);
      await callTool('write_file', {
        path: filePath,
        content: buildFixture(workflowId, 1),
        mode: 'rewrite',
      });
      await callTool('edit_block', {
        file_path: filePath,
        old_string: marker(workflowId, 1, 'original'),
        new_string: marker(workflowId, 1, 'updated'),
        expected_replacements: 1,
      });
      const persisted = await fs.readFile(filePath, 'utf8');
      assert.equal(persisted.includes(marker(workflowId, 1, 'updated')), true);
    }),
  );
}

try {
  await client.connect(transport);
  await callTool('set_config_value', {
    key: 'allowedDirectories',
    value: [testDir],
  });
  await callTool('set_config_value', {
    key: 'fileWriteLineLimit',
    value: 5000,
  });
  await callTool('set_config_value', {
    key: 'fileReadLineLimit',
    value: 500,
  });

  const startedAt = performance.now();
  await runSequentialEditWorkflow('markdown-100', 'md', 100, 'markdown');
  await runSequentialEditWorkflow('python-40', 'py', 40, 'python');
  await runConcurrentFileWorkflows(8);

  const elapsed = performance.now() - startedAt;
  assert.equal(elapsed < 180_000, true, `text edit workflows took ${elapsed.toFixed(0)}ms`);
  console.log(`Text edit performance contract passed in ${elapsed.toFixed(0)}ms`);
} finally {
  await client.close().catch(() => {});
  await fs.rm(testDir, { recursive: true, force: true });
}
