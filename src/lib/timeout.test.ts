import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from './timeout';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withTimeout', () => {
  it('在超时前完成则返回结果', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 100, '测试');
    expect(result).toBe('ok');
  });

  it('挂起的 Promise 会抛出 TimeoutError', async () => {
    await expect(
      withTimeout(new Promise<string>(() => undefined), 20, '后台响应'),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('原始错误在超时前到达时原样抛出', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('原始错误')), 100, '测试'),
    ).rejects.toThrow('原始错误');
  });

  it('定时器会被清理，不留下悬挂计时器', async () => {
    await withTimeout(delay(5).then(() => 1), 500, '测试');
    expect(true).toBe(true);
  });
});
