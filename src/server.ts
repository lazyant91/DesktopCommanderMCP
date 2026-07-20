import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  InitializeRequestSchema,
  LATEST_PROTOCOL_VERSION,
  ListToolsRequestSchema,
  SUPPORTED_PROTOCOL_VERSIONS,
  type InitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { VERSION } from './version.js';
import { getConfig, setConfigValue } from './tools/config.js';
import {
  CreateDirectoryArgsSchema,
  ForceTerminateArgsSchema,
  GetConfigArgsSchema,
  GetFileInfoArgsSchema,
  InteractWithProcessArgsSchema,
  ListDirectoryArgsSchema,
  ListSessionsArgsSchema,
  MoveFileArgsSchema,
  PublicEditBlockArgsSchema,
  ReadFileArgsSchema,
  ReadMultipleFilesArgsSchema,
  ReadProcessOutputArgsSchema,
  SetConfigValueArgsSchema,
  StartProcessArgsSchema,
  WriteFileArgsSchema,
} from './tools/schemas.js';
import {
  handleCreateDirectory,
  handleGetFileInfo,
  handleListDirectory,
  handleMoveFile,
  handleReadFile,
  handleReadMultipleFiles,
  handleWriteFile,
} from './handlers/filesystem-handlers.js';
import { handleEditBlock } from './handlers/edit-search-handlers.js';
import {
  handleForceTerminate,
  handleInteractWithProcess,
  handleListSessions,
  handleReadProcessOutput,
  handleStartProcess,
} from './handlers/terminal-handlers.js';
import type { ServerResult } from './types.js';

export const toolDefinitions = [
  {
    name: 'get_config',
    description: 'Return local MCP configuration and host information.',
    inputSchema: zodToJsonSchema(GetConfigArgsSchema),
    annotations: { title: 'Get Configuration', readOnlyHint: true },
  },
  {
    name: 'set_config_value',
    description: 'Set one supported local MCP configuration value.',
    inputSchema: zodToJsonSchema(SetConfigValueArgsSchema),
    annotations: {
      title: 'Set Configuration Value',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'read_file',
    description: 'Read a local text file with optional line offset and length.',
    inputSchema: zodToJsonSchema(ReadFileArgsSchema),
    annotations: { title: 'Read File', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'read_multiple_files',
    description: 'Read multiple local text files and return per-file results.',
    inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema),
    annotations: { title: 'Read Multiple Files', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'write_file',
    description: 'Write or append text content to a local file.',
    inputSchema: zodToJsonSchema(WriteFileArgsSchema),
    annotations: {
      title: 'Write File',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'create_directory',
    description: 'Create a local directory, including missing parent directories.',
    inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema),
    annotations: {
      title: 'Create Directory',
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'list_directory',
    description: 'List a local directory tree to a bounded depth.',
    inputSchema: zodToJsonSchema(ListDirectoryArgsSchema),
    annotations: { title: 'List Directory', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'move_file',
    description: 'Move or rename a local file or directory.',
    inputSchema: zodToJsonSchema(MoveFileArgsSchema),
    annotations: {
      title: 'Move File',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'get_file_info',
    description: 'Return metadata for a local file or directory.',
    inputSchema: zodToJsonSchema(GetFileInfoArgsSchema),
    annotations: { title: 'Get File Information', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'edit_block',
    description: 'Replace an exact text block in a local text file.',
    inputSchema: zodToJsonSchema(PublicEditBlockArgsSchema),
    annotations: {
      title: 'Edit Text Block',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'start_process',
    description: 'Start an owned local terminal process or interactive session.',
    inputSchema: zodToJsonSchema(StartProcessArgsSchema),
    annotations: {
      title: 'Start Process',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'read_process_output',
    description: 'Read bounded output from an owned terminal session.',
    inputSchema: zodToJsonSchema(ReadProcessOutputArgsSchema),
    annotations: { title: 'Read Process Output', readOnlyHint: true },
  },
  {
    name: 'interact_with_process',
    description: 'Send input to an owned interactive terminal session.',
    inputSchema: zodToJsonSchema(InteractWithProcessArgsSchema),
    annotations: {
      title: 'Interact With Process',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'force_terminate',
    description: 'Terminate an owned terminal session.',
    inputSchema: zodToJsonSchema(ForceTerminateArgsSchema),
    annotations: {
      title: 'Terminate Session',
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'list_sessions',
    description: 'List terminal sessions owned by this MCP server.',
    inputSchema: zodToJsonSchema(ListSessionsArgsSchema),
    annotations: { title: 'List Sessions', readOnlyHint: true },
  },
] as const;

export let currentClient = {
  name: 'uninitialized',
  version: 'uninitialized',
};

export const currentCallIsRemote = false;
export const currentRemoteClient: null = null;

export function flushDeferredMessages(): void {}

export const server = new Server(
  {
    name: 'desktop-commander',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  },
);

server.setRequestHandler(InitializeRequestSchema, async (request: InitializeRequest) => {
  const clientInfo = request.params?.clientInfo;
  if (clientInfo) {
    currentClient = {
      name: clientInfo.name || 'unknown',
      version: clientInfo.version || 'unknown',
    };
  }

  const requestedVersion = request.params?.protocolVersion;
  const protocolVersion =
    requestedVersion && SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
      ? requestedVersion
      : LATEST_PROTOCOL_VERSION;

  return {
    protocolVersion,
    capabilities: {
      tools: {},
      logging: {},
    },
    serverInfo: {
      name: 'desktop-commander',
      version: VERSION,
    },
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [...toolDefinitions],
}));

type ToolHandler = (args: unknown) => Promise<ServerResult>;

const toolHandlers: Record<string, ToolHandler> = {
  get_config: async () => getConfig(),
  set_config_value: setConfigValue,
  read_file: handleReadFile,
  read_multiple_files: handleReadMultipleFiles,
  write_file: handleWriteFile,
  create_directory: handleCreateDirectory,
  list_directory: handleListDirectory,
  move_file: handleMoveFile,
  get_file_info: handleGetFileInfo,
  edit_block: async (args) => handleEditBlock(PublicEditBlockArgsSchema.parse(args)),
  start_process: handleStartProcess,
  read_process_output: handleReadProcessOutput,
  interact_with_process: handleInteractWithProcess,
  force_terminate: handleForceTerminate,
  list_sessions: async () => handleListSessions(),
};

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const handler = toolHandlers[request.params.name];
  if (!handler) {
    return {
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${request.params.name}`,
        },
      ],
      isError: true,
    };
  }

  try {
    return (await handler(request.params.arguments ?? {})) as any;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Tool call failed: ${message}` }],
      isError: true,
    };
  }
});
