import type { AnalysisResult, AppSettings, ModelResponse } from '@/shared/types';
import { ensureJudgeOrigin } from './permissions';
import { parseAnalysis } from './parse';
import { buildJudgeMessages } from './prompt';

export interface JudgeInput {
  taskId: string;
  question: string;
  responses: ModelResponse[];
  siteNames: Record<string, string>;
  settings: AppSettings;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/** 调用用户自配的 OpenAI Compatible API 生成综合裁决。API Key 只存在于本地请求中。 */
export async function runAnalysis(input: JudgeInput): Promise<AnalysisResult> {
  const { judge, judgePrompt, onlineFactCheck } = input.settings;
  const usable = input.responses.filter(
    (response) => response.status === 'completed' && response.content.trim(),
  );

  if (!judge.apiKey.trim()) {
    throw new Error('请先在「设置 → 综合分析配置」中填写裁决模型的 API Key。');
  }
  if (!judge.baseUrl.trim() || !judge.model.trim()) {
    throw new Error('请先在设置中填写 API Base URL 与 Model。');
  }
  if (usable.length === 0) {
    throw new Error('没有可用的模型回答，无法进行综合分析。');
  }

  await ensureJudgeOrigin(judge.baseUrl);

  const endpoint = `${judge.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const messages = buildJudgeMessages(
    input.question,
    input.responses,
    input.siteNames,
    judgePrompt,
    onlineFactCheck,
  );

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${judge.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: judge.model.trim(),
        messages,
        temperature: judge.temperature,
        max_tokens: judge.maxTokens,
        stream: false,
      }),
    });
  } catch (error) {
    throw new Error(
      `无法连接裁决模型：${error instanceof Error ? error.message : String(error)}。请检查 API 地址与网络。`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`裁决模型请求失败（HTTP ${response.status}）：${body.slice(0, 300)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const markdown = data.choices?.[0]?.message?.content;
  if (!markdown?.trim()) {
    throw new Error(data.error?.message || '裁决模型未返回内容。');
  }

  return parseAnalysis(markdown, {
    questionId: input.taskId,
    judgeModel: judge.model.trim(),
    responses: input.responses,
    siteNames: input.siteNames,
    onlineFactCheck,
  });
}
