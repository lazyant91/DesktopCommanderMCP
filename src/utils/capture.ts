/**
 * Temporary no-op event boundary retained for active runtime call sites.
 * It performs no logging, persistence, analytics, or network communication.
 */
export async function capture(
  _event: string,
  _properties?: unknown,
): Promise<void> {}
