import { describe, expect, it } from 'vitest';
import { allSettled, createTask, hasUsableAnswers } from './task';
import type { ModelResponse } from './types';

describe('task', () => {
  it('创建任务时为每个站点初始化等待中状态', () => {
    const task = createTask('问题', ['a', 'b']);
    expect(task.id).toMatch(/^task-/);
    expect(task.phase).toBe('running');
    expect(task.responses.map((item) => item.status)).toEqual(['pending', 'pending']);
  });

  it('只有所有站点结束后才算全部完成', () => {
    const task = createTask('问题', ['a', 'b']);
    expect(allSettled(task)).toBe(false);
    task.responses[0] = { ...task.responses[0], status: 'completed' };
    expect(allSettled(task)).toBe(false);
    task.responses[1] = { ...task.responses[1], status: 'failed' };
    expect(allSettled(task)).toBe(true);
  });

  it('部分失败不阻止综合分析', () => {
    const task = createTask('问题', ['a', 'b']);
    const responses: ModelResponse[] = [
      { siteId: 'a', status: 'completed', content: '有效回答', attempts: 1 },
      { siteId: 'b', status: 'failed', content: '', error: '未登录', attempts: 1 },
    ];
    task.responses = responses;
    expect(hasUsableAnswers(task)).toBe(true);
    task.responses = responses.map((item) => ({ ...item, content: '' }));
    expect(hasUsableAnswers(task)).toBe(false);
  });
});
