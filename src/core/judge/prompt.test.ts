import { describe, expect, it } from 'vitest';
import { buildJudgeMessages } from './prompt';
import type { ModelResponse } from '@/shared/types';

const responses: ModelResponse[] = [
  { siteId: 'a', status: 'completed', content: '回答 A', attempts: 1 },
  { siteId: 'b', status: 'failed', content: '', error: '未登录', attempts: 1 },
];

describe('buildJudgeMessages', () => {
  it('包含问题、可用回答与失败模型说明', () => {
    const messages = buildJudgeMessages('如何安装？', responses, { a: '模型A', b: '模型B' }, '系统提示词', false);
    expect(messages[0].content).toBe('系统提示词');
    expect(messages[1].content).toContain('如何安装？');
    expect(messages[1].content).toContain('回答 A');
    expect(messages[1].content).toContain('模型B');
    expect(messages[1].content).not.toContain('回答 B');
  });

  it('始终包含禁止编造来源的约束', () => {
    const messages = buildJudgeMessages('问题', responses, {}, '系统', true);
    expect(messages[1].content).toContain('禁止编造网址');
    expect(messages[1].content).toContain('尚未经过外部来源验证');
  });
});
