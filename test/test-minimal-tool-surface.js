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

console.log('Minimal tool surface contract passed');
