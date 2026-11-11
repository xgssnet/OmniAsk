import { describe, expect, it } from 'vitest';
import { formatHistoryAnswers } from './historyFile';
import type { HistoryRecord } from '@/shared/types';

const record: HistoryRecord = {
  id: 'record-1',
  question: '如何部署 Docker？',
  createdAt: 1_700_000_000_000,
  selectedSiteIds: ['chatgpt', 'claude', 'gemini'],
  responses: [
    { siteId: 'chatgpt', status: 'completed', content: '使用官方仓库安装。', attempts: 1 },
    { siteId: 'claude', status: 'failed', content: '', error: '未登录', attempts: 1 },
    { siteId: 'gemini', status: 'completed', content: '', attempts: 1 },
  ],
  status: 'completed',
};

describe('formatHistoryAnswers', () => {
  it('包含问题、每个模型名称与回答内容', () => {
    const text = formatHistoryAnswers(record, {
      chatgpt: 'ChatGPT',
      claude: 'Claude',
      gemini: 'Gemini',
    });
    expect(text).toContain('# 如何部署 Docker？');
    expect(text).toContain('## ChatGPT');
    expect(text).toContain('使用官方仓库安装。');
    expect(text).toContain('## Claude');
    expect(text).toContain('执行失败：未登录');
    expect(text).toContain('## Gemini');
    expect(text).toContain('（原始回答未保存）');
  });

  it('未知站点回退显示 siteId', () => {
    const text = formatHistoryAnswers(record);
    expect(text).toContain('## chatgpt');
    expect(text).toContain('## claude');
  });

  it('不包含综合答案，便于只复制各模型原始回答', () => {
    const withAnalysis: HistoryRecord = {
      ...record,
      analysis: {
        questionId: record.id,
        createdAt: record.createdAt,
        judgeModel: 'judge',
        structured: [],
        consensus: [],
        conflicts: [],
        factChecks: [],
        finalAnswer: '这是综合裁决结果',
        coreConclusions: [],
        recommendation: '',
        uncertainties: [],
        sources: [],
        confidence: 'low',
      },
    };
    expect(formatHistoryAnswers(withAnalysis)).not.toContain('这是综合裁决结果');
  });
});
