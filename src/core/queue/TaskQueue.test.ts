import { describe, expect, it } from 'vitest';
import { TaskQueue } from './TaskQueue';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TaskQueue', () => {
  it('严格遵守并发上限', async () => {
    let active = 0;
    let peak = 0;
    const queue = new TaskQueue(2);
    const results = await queue.runAll(
      Array.from({ length: 6 }, (_, index) => ({
        id: `job-${index}`,
        run: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await delay(8);
          active -= 1;
          return index;
        },
      })),
    );
    expect(results).toHaveLength(6);
    expect(peak).toBe(2);
    expect(results.every((result) => !result.error)).toBe(true);
  });

  it('单个任务失败不影响其他任务', async () => {
    const results = await new TaskQueue(2).runAll([
      { id: 'ok', run: async () => 'success' },
      {
        id: 'bad',
        run: async () => {
          throw new Error('适配器失败');
        },
      },
    ]);
    expect(results.find((item) => item.id === 'ok')?.value).toBe('success');
    expect(results.find((item) => item.id === 'bad')?.error?.message).toBe('适配器失败');
  });

  it('超时会中止正在执行的任务', async () => {
    const results = await new TaskQueue(1).runAll([
      {
        id: 'slow',
        timeoutMs: 20,
        run: (signal: AbortSignal) =>
          new Promise<string>((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      },
    ]);
    expect(results[0].error?.message).toContain('任务超时');
    expect(results[0].attempts).toBe(1);
  });

  it('按配置重试并在成功后停止', async () => {
    let calls = 0;
    const results = await new TaskQueue(1).runAll([
      {
        id: 'retry',
        retries: 2,
        run: async () => {
          calls += 1;
          if (calls < 3) throw new Error('temporary');
          return 'done';
        },
      },
    ]);
    expect(calls).toBe(3);
    expect(results[0].value).toBe('done');
    expect(results[0].attempts).toBe(3);
  });

  it('全部取消时中止未完成任务', async () => {
    const queue = new TaskQueue(1);
    const running = queue.runAll([
      {
        id: 'a',
        run: (signal: AbortSignal) =>
          new Promise<string>((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          }),
      },
      { id: 'b', run: async () => 'never' },
    ]);
    queue.cancelAll();
    const results = await running;
    expect(results.every((result) => result.cancelled || result.error)).toBe(true);
    expect(results.some((result) => result.id === 'b')).toBe(false);
  });
});
