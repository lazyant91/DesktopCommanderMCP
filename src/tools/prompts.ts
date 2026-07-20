import { ServerResult } from '../types.js';

interface Prompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
  categories: string[];
  secondaryTag?: string;
  votes: number;
  gaClicks: number;
  icon: string;
  author: string;
  verified: boolean;
}

export interface PromptsData {
  version: string;
  description: string;
  prompts: Prompt[];
}

const REMOVED_PROMPTS: PromptsData = Object.freeze({
  version: 'removed',
  description: 'Onboarding prompt catalog removed',
  prompts: [],
});

export async function loadPromptsData(): Promise<PromptsData> {
  return {
    ...REMOVED_PROMPTS,
    prompts: [],
  };
}

export async function getPrompts(_params: unknown): Promise<ServerResult> {
  return {
    content: [
      {
        type: 'text',
        text: 'Onboarding prompts are not available in this standalone local MCP.',
      },
    ],
    isError: true,
  };
}
