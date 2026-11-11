import { describe, expect, it } from 'vitest';
import { allSettled, analysisViewState, createTask, hasUsableAnswers } from './task';
import type { ActiveTask } from './task';
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

  it('综合答案区状态能区分各种「没有结果」的原因', () => {
    const base = createTask('问题', ['a']);
    base.responses = [
      { siteId: 'a', status: 'completed', content: '有效回答', attempts: 1 },
    ];

    const withResult = {
      ...base,
      analysis: { finalAnswer: '综合答案' },
    } as unknown as ActiveTask;
    expect(analysisViewState(withResult, false)).toBe('done');

    expect(analysisViewState({ ...base, phase: 'analyzing' }, true)).toBe('analyzing');
    expect(analysisViewState({ ...base, phase: 'done', error: '综合分析失败：401' }, true)).toBe(
      'failed',
    );
    expect(analysisViewState({ ...base, phase: 'done' }, false)).toBe('not-configured');

    const noAnswers = { ...base, responses: [] as ModelResponse[], phase: 'done' } as ActiveTask;
    expect(analysisViewState(noAnswers, true)).toBe('no-answers');
    expect(analysisViewState({ ...base, phase: 'done' }, true)).toBe('idle');
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
