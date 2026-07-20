import { ServerResult } from '../types.js';

const unsupported = (toolName: string): ServerResult => ({
  content: [
    {
      type: 'text',
      text: `${toolName} is not available in this standalone local MCP. Only processes created as owned terminal sessions can be managed.`,
    },
  ],
  isError: true,
});

export async function listProcesses(): Promise<ServerResult> {
  return unsupported('Global process listing');
}

export async function killProcess(_args: unknown): Promise<ServerResult> {
  return unsupported('Arbitrary PID termination');
}
