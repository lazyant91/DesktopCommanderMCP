import { ServerResult } from '../types.js';

const unsupported = (): ServerResult => ({
  content: [
    {
      type: 'text',
      text: 'Background search sessions are not available in this standalone local MCP. Use an owned terminal session with a local search command when needed.',
    },
  ],
  isError: true,
});

export async function handleStartSearch(_args: unknown): Promise<ServerResult> {
  return unsupported();
}

export async function handleGetMoreSearchResults(_args: unknown): Promise<ServerResult> {
  return unsupported();
}

export async function handleStopSearch(_args: unknown): Promise<ServerResult> {
  return unsupported();
}

export async function handleListSearches(): Promise<ServerResult> {
  return unsupported();
}
