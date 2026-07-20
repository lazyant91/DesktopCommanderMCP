// Retained as a compatibility boundary for the current request dispatcher.
// The standalone local MCP does not persist tool names, arguments, or outputs.
export async function trackToolCall(
  _toolName: string,
  _args?: unknown,
): Promise<void> {}
