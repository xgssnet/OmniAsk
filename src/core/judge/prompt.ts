import type { ModelResponse } from '@/shared/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 构造裁决模型的输入，明确要求不编造来源、不掩盖分歧。 */
export function buildJudgeMessages(
  question: string,
  responses: ModelResponse[],
  siteNames: Record<string, string>,
  systemPrompt: string,
  onlineFactCheck: boolean,
): ChatMessage[] {
  const usable = responses.filter(
    (response) => response.status === 'completed' && response.content.trim(),
  );

  const answers = usable
    .map(
      (response, index) =>
        `### 模型 ${index + 1}：${siteNames[response.siteId] ?? response.siteId}\n\n${response.content}`,
    )
    .join('\n\n---\n\n');

  const failed = responses
    .filter((response) => response.status === 'failed' || response.status === 'cancelled')
    .map(
      (response) =>
        `- ${siteNames[response.siteId] ?? response.siteId}：${response.status === 'failed' ? '失败' : '已取消'}${response.error ? `（${response.error}）` : ''}`,
    )
    .join('\n');

  const user = [
    '## 用户问题',
    question,
    '',
    '## 各模型回答',
    answers || '（没有可用的模型回答）',
    failed ? `\n## 未成功返回的模型\n${failed}\n` : '',
    '## 输出要求',
    '严格按系统提示词规定的章节输出最终裁决。',
    onlineFactCheck
      ? '本次开启了联网核查偏好，但你只能使用上面回答中真实出现的网址；没有可信来源时必须写明「该结论尚未经过外部来源验证」。'
      : '本次未开启联网核查，所有无法通过回答本身验证的内容必须标记为「尚未验证」。',
    '禁止编造网址、引用、官方文档或事实依据；禁止把推测写成事实；不要掩盖模型之间的分歧。',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: user },
  ];
}
