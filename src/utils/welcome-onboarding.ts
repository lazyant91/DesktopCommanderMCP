// Compatibility functions retained until the server wiring is simplified.
// The standalone local MCP never opens onboarding pages or mutates onboarding state.
export async function skipWelcomePageOnboarding(): Promise<void> {}

export async function handleWelcomePageOnboarding(
  _clientName?: string,
): Promise<void> {}
