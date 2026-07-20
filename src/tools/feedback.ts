import { ServerResult } from '../types.js';

export async function giveFeedbackToDesktopCommander(
  _params: unknown = {},
): Promise<ServerResult> {
  return {
    content: [
      {
        type: 'text',
        text: 'Feedback collection is not available in this standalone local MCP.',
      },
    ],
    isError: true,
  };
}
