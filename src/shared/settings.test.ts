import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import type { AppSettings } from './types';

describe('normalizeSettings', () => {
  it('旧配置缺少新增字段时补上默认值', () => {
    const legacy = {
      theme: 'dark',
      defaultSiteIds: ['chatgpt'],
      maxConcurrency: 2,
      autoAnalysis: true,
      onlineFactCheck: false,
      showDetailedAnalysis: true,
      saveRawResponses: true,
      judge: DEFAULT_SETTINGS.judge,
      judgePrompt: '自定义提示词',
    } as unknown as AppSettings;

    const result = normalizeSettings(legacy);
    expect(result.closeTabsAfterTask).toBe(true);
    expect(result.theme).toBe('dark');
    expect(result.judgePrompt).toBe('自定义提示词');
  });

  it('保留用户已修改的值与 API Key', () => {
    const result = normalizeSettings({
      ...DEFAULT_SETTINGS,
      maxConcurrency: 5,
      closeTabsAfterTask: false,
      judge: { ...DEFAULT_SETTINGS.judge, apiKey: 'local-only' },
    });
    expect(result.maxConcurrency).toBe(5);
    expect(result.closeTabsAfterTask).toBe(false);
    expect(result.judge.apiKey).toBe('local-only');
  });
});
