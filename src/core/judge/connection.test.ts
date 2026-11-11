import { afterEach, describe, expect, it, vi } from 'vitest';
import { testJudgeConnection } from './connection';
import type { JudgeConfig } from '@/shared/types';

const config: JudgeConfig = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  temperature: 0.2,
  maxTokens: 4096,
};

function mockResponse(ok: boolean, status: number, body: string) {
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    text: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('testJudgeConnection', () => {
  it('缺少 API Key 时直接给出明确提示且不发请求', async () => {
    const fetchMock = mockResponse(true, 200, '{}');
    const result = await testJudgeConnection({ ...config, apiKey: '' });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('API Key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('缺少 Model 时不发请求', async () => {
    const fetchMock = mockResponse(true, 200, '{}');
    const result = await testJudgeConnection({ ...config, model: '  ' });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('Model');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('正常响应时返回成功与模型返回片段', async () => {
    const fetchMock = mockResponse(
      true,
      200,
      JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
    );
    const result = await testJudgeConnection(config);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.sample).toBe('OK');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(options.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(options.body) as { model: string; max_tokens: number };
    expect(body.model).toBe('test-model');
    expect(body.max_tokens).toBe(16);
  });

  it('401 时提示认证失败并保留 HTTP 状态', async () => {
    mockResponse(false, 401, '{"error":{"message":"invalid api key"}}');
    const result = await testJudgeConnection(config);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.detail).toContain('认证失败');
  });

  it('404 时提示检查 Base URL 与模型名', async () => {
    mockResponse(false, 404, 'not found');
    const result = await testJudgeConnection(config);
    expect(result.detail).toContain('Base URL');
  });

  it('响应不是 JSON 时给出明确提示', async () => {
    mockResponse(true, 200, '<html>login</html>');
    const result = await testJudgeConnection(config);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('不是合法 JSON');
  });

  it('响应缺少回答内容时不误报成功', async () => {
    mockResponse(true, 200, JSON.stringify({ choices: [{ message: {} }] }));
    const result = await testJudgeConnection(config);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('没有可读取的回答内容');
  });

  it('未授予 API 域名权限时标记 needsPermission 且不发请求', async () => {
    vi.stubGlobal('chrome', { permissions: { contains: async () => false } });
    const fetchMock = mockResponse(true, 200, '{}');
    const result = await testJudgeConnection(config);
    expect(result.ok).toBe(false);
    expect(result.needsPermission).toBe(true);
    expect(result.detail).toContain('授权');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('网络异常时给出可操作提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    const result = await testJudgeConnection(config);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('无法连接 API');
  });
});
