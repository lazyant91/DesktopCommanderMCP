class FeatureFlagManager {
  async initialize(): Promise<void> {}

  get<T>(_: string, defaultValue: T = false as T): T {
    return defaultValue;
  }

  getAll(): Record<string, never> {
    return {};
  }

  async refresh(): Promise<boolean> {
    return false;
  }

  wasLoadedFromCache(): boolean {
    return false;
  }

  async waitForFreshFlags(): Promise<void> {}

  destroy(): void {}
}

// Retained temporarily as a compatibility boundary for callers that will be
// removed in later slimming slices. It performs no I/O and has no timers.
export const featureFlagManager = new FeatureFlagManager();
