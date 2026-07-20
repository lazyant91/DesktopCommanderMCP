import assert from 'node:assert/strict';

import { toolDefinitions } from '../dist/server.js';
import { toolArgSchemas } from '../dist/tools/schemas.js';

const expectedTools = [
  'get_config',
  'set_config_value',
  'read_file',
  'read_multiple_files',
  'write_file',
  'create_directory',
  'list_directory',
  'move_file',
  'get_file_info',
  'edit_block',
  'start_process',
  'read_process_output',
  'interact_with_process',
  'force_terminate',
  'list_sessions',
];

assert.deepEqual(toolDefinitions.map((tool) => tool.name), expectedTools);
assert.deepEqual(Object.keys(toolArgSchemas), expectedTools);

const definitions = Object.fromEntries(toolDefinitions.map((tool) => [tool.name, tool]));

for (const tool of toolDefinitions) {
  assert.equal('_meta' in tool, false, `${tool.name} must not expose MCP App UI metadata`);
}

for (const removedTool of [
  'write_pdf',
  'start_search',
  'get_more_search_results',
  'stop_search',
  'list_searches',
  'list_processes',
  'kill_process',
  'get_usage_stats',
  'get_recent_tool_calls',
  'give_feedback_to_desktop_commander',
  'get_prompts',
  'track_ui_event',
]) {
  assert.equal(expectedTools.includes(removedTool), false);
  assert.equal(removedTool in toolArgSchemas, false);
}

function propertiesFor(toolName) {
  return Object.keys(definitions[toolName].inputSchema.properties ?? {});
}

assert.deepEqual(propertiesFor('get_config'), []);
assert.deepEqual(propertiesFor('read_file'), ['path', 'offset', 'length']);
assert.deepEqual(propertiesFor('write_file'), ['path', 'content', 'mode']);
assert.deepEqual(propertiesFor('list_directory'), ['path', 'depth']);
assert.deepEqual(propertiesFor('edit_block'), [
  'file_path',
  'old_string',
  'new_string',
  'expected_replacements',
]);
assert.deepEqual(propertiesFor('start_process'), [
  'command',
  'timeout_ms',
  'shell',
  'verbose_timing',
]);

for (const removedParameter of ['isUrl', 'sheet', 'range', 'options', 'origin', 'content']) {
  assert.equal(propertiesFor('read_file').includes(removedParameter), false);
}

console.log('Minimal tool surface contract passed');
