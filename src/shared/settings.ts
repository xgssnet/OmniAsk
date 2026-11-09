import { JUDGE_SYSTEM_PROMPT } from './prompts';
import type { AppSettings } from './types';

export const STORAGE_KEYS = {
  settings: 'omniask:settings',
  sites: 'omniask:sites',
  tasks: 'omniask:tasks',
} as const;

export const APP_VERSION = '0.1.0';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  defaultSiteIds: ['chatgpt', 'claude', 'deepseek'],
  maxConcurrency: 3,
  autoAnalysis: true,
  onlineFactCheck: false,
  showDetailedAnalysis: true,
  saveRawResponses: true,
  judge: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 4096,
  },
  judgePrompt: JUDGE_SYSTEM_PROMPT,
};
