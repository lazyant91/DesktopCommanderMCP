export const MCP_UI_EXPERIMENT_NAME = 'McpUiPreviews';
export const MCP_UI_SHOW_VARIANT = 'showMCPUi';
export const MCP_UI_HIDE_VARIANT = 'notShowMCPUi';

export interface McpUiPreviewDecisionDeps {
  getExistingAssignment: () => Promise<unknown>;
  isFirstRun: () => boolean;
  wasLoadedFromCache: () => boolean;
  waitForFreshFlags: () => Promise<void>;
  getABTestVariant: (experimentName: string) => Promise<string | null>;
  capture: (event: string, properties?: Record<string, unknown>) => Promise<unknown> | unknown;
}

export async function resolveMcpUiPreviewDecision(
  _deps: McpUiPreviewDecisionDeps,
): Promise<boolean> {
  return true;
}

// UI retention is decided locally until the dedicated UI slimming slice.
export async function shouldShowMcpUiPreviews(): Promise<boolean> {
  return true;
}
