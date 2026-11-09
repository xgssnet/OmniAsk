import type { JudgeConfig } from '@/shared/types';
import { ensureJudgeOrigin } from './permissions';

export interface JudgeConnectionResult {
  ok: boolean;
  detail: string;
  status?: number;
  latencyMs: number;
  sample?: string;
}

const TEST_TIMEOUT_MS = 20_000;

interface ChatCompletionPayload {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

function describeHttpError(status: number): string {
  switch (status) {
    case 400:
      return '请求格式不被接受，请检查 Base URL 是否需要以 /v1 结尾，或该网关是否要求额外参数';
    case 401:
    case 403:
      return '认证失败，请检查 API Key 是否正确、是否具备该模型的调用权限';
    case 404:
      return '接口或模型不存在，请检查 Base URL 路径与 Model 名称';
    case 429:
      return '请求被限流或账户额度不足';
    default:
      return status >= 500 ? 'API 服务端错误，请稍后重试' : `请求失败（HTTP ${status}）`;
  }
}

/**
 * 连通性自检：向用户自配的 OpenAI Compatible API 发送一条极短消息。
 * 不读取历史、不写存储、不触发任务；只在用户点击「测试连接」时执行。
 */
export async function testJudgeConnection(
  config: JudgeConfig,
): Promise<JudgeConnectionResult> {
  const startedAt = Date.now();
  const finish = (
    result: Omit<JudgeConnectionResult, 'latencyMs'>,
  ): JudgeConnectionResult => ({ ...result, latencyMs: Date.now() - startedAt });

  if (!config.baseUrl.trim()) return finish({ ok: false, detail: '请先填写 API Base URL。' });
  if (!config.apiKey.trim()) return finish({ ok: false, detail: '请先填写 API Key。' });
  if (!config.model.trim()) return finish({ ok: false, detail: '请先填写 Model。' });

  try {
    await ensureJudgeOrigin(config.baseUrl);
  } catch (error) {
    return finish({
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const endpoint = `${config.baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model.trim(),
        messages: [{ role: 'user', content: '请只回复两个字：OK' }],
        temperature: 0,
        max_tokens: 16,
        stream: false,
      }),
      signal: controller.signal,
    });

    const raw = await response.text().catch(() => '');
    if (!response.ok) {
      const snippet = raw.trim().slice(0, 240);
      return finish({
        ok: false,
        status: response.status,
        detail: `${describeHttpError(response.status)}${snippet ? `：${snippet}` : ''}`,
      });
    }

    let payload: ChatCompletionPayload;
    try {
      payload = JSON.parse(raw) as ChatCompletionPayload;
    } catch {
      return finish({
        ok: false,
        status: response.status,
        detail: '接口返回的不是合法 JSON，请确认该地址是 OpenAI Compatible 的 /chat/completions 接口。',
      });
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return finish({
        ok: false,
        status: response.status,
        detail:
          payload.error?.message ||
          '接口返回成功但没有可读取的回答内容，请检查响应格式是否符合 OpenAI Compatible 规范。',
      });
    }

    return finish({
      ok: true,
      status: response.status,
      detail: '连接成功：API 地址、API Key 与模型均可正常调用。',
      sample: content.slice(0, 120),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return finish({
      ok: false,
      detail: aborted
        ? `连接超时（${TEST_TIMEOUT_MS / 1000}s），请检查 API 地址、网络或代理设置。`
        : `无法连接 API：${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    clearTimeout(timer);
  }
}
