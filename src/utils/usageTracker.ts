export interface ToolUsageStats {
  filesystemOperations: number;
  terminalOperations: number;
  editOperations: number;
  searchOperations: number;
  configOperations: number;
  processOperations: number;
  totalToolCalls: number;
  successfulCalls: number;
  failedCalls: number;
  toolCounts: Record<string, number>;
  firstUsed: number;
  lastUsed: number;
  totalSessions: number;
  lastFeedbackPrompt: number;
  lastFeedbackPromptDate?: string;
  feedbackAttempts?: number;
}

export interface OnboardingState {
  promptsUsed: boolean;
  attemptsShown: number;
  lastShownAt: number;
}

export interface UsageSession {
  sessionStart: number;
  lastActivity: number;
  commandsInSession: number;
  promptedThisSession: boolean;
}

const EMPTY_STATS: ToolUsageStats = Object.freeze({
  filesystemOperations: 0,
  terminalOperations: 0,
  editOperations: 0,
  searchOperations: 0,
  configOperations: 0,
  processOperations: 0,
  totalToolCalls: 0,
  successfulCalls: 0,
  failedCalls: 0,
  toolCounts: {},
  firstUsed: 0,
  lastUsed: 0,
  totalSessions: 0,
  lastFeedbackPrompt: 0,
});

const EMPTY_ONBOARDING_STATE: OnboardingState = Object.freeze({
  promptsUsed: false,
  attemptsShown: 0,
  lastShownAt: 0,
});

class UsageTracker {
  async getStats(): Promise<ToolUsageStats> {
    return { ...EMPTY_STATS, toolCounts: {} };
  }

  async trackSuccess(_toolName: string): Promise<ToolUsageStats> {
    return this.getStats();
  }

  async trackFailure(_toolName: string): Promise<ToolUsageStats> {
    return this.getStats();
  }

  async shouldPromptForFeedback(): Promise<boolean> {
    return false;
  }

  async getFeedbackPromptMessage(): Promise<{ variant: string; message: string }> {
    return { variant: 'disabled', message: '' };
  }

  async shouldPromptForErrorFeedback(): Promise<boolean> {
    return false;
  }

  async markFeedbackPrompted(): Promise<void> {}

  async markFeedbackGiven(): Promise<void> {}

  async getUsageSummary(): Promise<string> {
    return 'Usage analytics are not collected.';
  }

  async getOnboardingState(): Promise<OnboardingState> {
    return { ...EMPTY_ONBOARDING_STATE };
  }

  async saveOnboardingState(_state: OnboardingState): Promise<void> {}

  async shouldShowOnboarding(): Promise<boolean> {
    return false;
  }

  async getOnboardingMessage(): Promise<{ variant: string; message: string }> {
    return { variant: 'disabled', message: '' };
  }

  async markOnboardingShown(_variant: string): Promise<void> {}

  async markOnboardingPromptsUsed(): Promise<void> {}

  async markPromptUsed(_promptId: string, _category: string): Promise<void> {}

  async resetOnboardingState(): Promise<void> {}
}

// Compatibility boundary for existing handlers. It intentionally performs no
// persistence, analytics, feedback prompting, or onboarding injection.
export const usageTracker = new UsageTracker();
