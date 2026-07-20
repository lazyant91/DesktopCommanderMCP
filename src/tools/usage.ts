import { ServerResult } from '../types.js';

export async function getUsageStats(): Promise<ServerResult> {
  return {
    content: [
      {
        type: 'text',
        text: 'Usage analytics are not collected in this local MCP.',
      },
    ],
    isError: true,
  };
}
