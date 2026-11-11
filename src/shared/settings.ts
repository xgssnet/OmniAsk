import { JUDGE_SYSTEM_PROMPT } from './prompts';
import type { AppSettings, DraftState } from './types';

export const STORAGE_KEYS = {
  settings: 'omniask:settings',
  sites: 'omniask:sites',
  tasks: 'omniask:tasks',
  activeTask: 'omniask:activetask',
  draft: 'omniask:draft',
} as const;

export const APP_VERSION = '0.1.1';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  defaultSiteIds: ['chatgpt', 'claude', 'deepseek'],
  maxConcurrency: 3,
  closeTabsAfterTask: true,
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

/** 旧版本保存的设置缺少新增字段时补齐默认值，UI 与后台统一使用。 */
export function normalizeSettings(saved: AppSettings): AppSettings {
  const base = saved ?? DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...base,
    judge: { ...DEFAULT_SETTINGS.judge, ...base.judge },
  };
}

export const DEFAULT_DRAFT: DraftState = {
  question: '',
  selectedSiteIds: DEFAULT_SETTINGS.defaultSiteIds,
};
