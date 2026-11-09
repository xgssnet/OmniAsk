import type {
  AnalysisResult,
  ConflictItem,
  FactCheckItem,
  ModelResponse,
  StructuredAnswer,
} from '@/shared/types';
import { extractUrls, factCheckFromMarkdown } from './factcheck';

export interface AnalysisMeta {
  questionId: string;
  judgeModel: string;
  responses: ModelResponse[];
  siteNames: Record<string, string>;
  onlineFactCheck: boolean;
}

/** 按 Markdown 标题切分章节，标题文字作为键。 */
export function splitSections(markdown: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current = 'preamble';
  for (const line of markdown.split('\n')) {
    const heading = /^#{1,3}\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[1].replace(/^#+\s*/, '').trim();
      sections[current] = '';
    } else {
      sections[current] = `${sections[current] ?? ''}${line}\n`;
    }
  }
  return sections;
}

export function findSection(sections: Record<string, string>, keywords: string[]): string {
  for (const [title, body] of Object.entries(sections)) {
    if (keywords.some((keyword) => title.includes(keyword))) return body.trim();
  }
  return '';
}

export function bulletLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 1 && !line.startsWith('|') && !line.startsWith('#'));
}

function firstParagraph(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith('#') && !part.startsWith('```')) ?? '';
}

function uncertainSentences(text: string): string[] {
  return text
    .split(/[。！？\n]/)
    .map((part) => part.trim())
    .filter((part) => /可能|不确定|尚未|也许|取决于|需要确认/.test(part))
    .slice(0, 8);
}

function toStructured(responses: ModelResponse[]): StructuredAnswer[] {
  return responses
    .filter((response) => response.status === 'completed' && response.content.trim())
    .map((response) => ({
      siteId: response.siteId,
      conclusion: firstParagraph(response.content).slice(0, 600),
      facts: bulletLines(response.content).slice(0, 12),
      evidence: [],
      data: [],
      sources: extractUrls([response.content]),
      reasoning: '',
      uncertainties: uncertainSentences(response.content),
      assumptions: [],
    }));
}

function toConflicts(text: string): ConflictItem[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => /争议|分歧|不同|矛盾|冲突|不一致/.test(line))
    .slice(0, 15)
    .map((line, index) => ({
      topic: `争议点 ${index + 1}`,
      positions: {},
      resolution: line.slice(0, 400),
    }));
}

/**
 * 把裁决模型的 Markdown 输出解析成结构化结果。
 * 置信度是保守的启发式判断，不代表结论已被证实；插件没有独立外部核验能力时不会给出 high。
 */
export function parseAnalysis(markdown: string, meta: AnalysisMeta): AnalysisResult {
  const sections = splitSections(markdown);
  const rawAnswers = meta.responses.map((response) => response.content);
  const allowedSources = extractUrls(rawAnswers);
  const factSection = findSection(sections, ['事实核查']);
  const factChecks: FactCheckItem[] = factCheckFromMarkdown(factSection, allowedSources);

  const verified = factChecks.some((item) => item.level === 'verified');
  const disputed = factChecks.some((item) => item.level === 'disputed');
  const confidence: AnalysisResult['confidence'] = verified && !disputed ? 'medium' : 'low';

  const opinionSection = findSection(sections, ['多模型观点']);
  const uncertainties = bulletLines(findSection(sections, ['不确定性'])).slice(0, 12);
  uncertainties.push(
    meta.onlineFactCheck
      ? '已开启联网核查偏好，但未配置独立的外部检索源，来源仅来自模型回答中真实出现的网址。'
      : '本次未进行独立外部来源核验，缺少证据的结论均已标记为尚未验证。',
  );

  return {
    questionId: meta.questionId,
    createdAt: Date.now(),
    judgeModel: meta.judgeModel,
    structured: toStructured(meta.responses),
    consensus: bulletLines(opinionSection)
      .filter((line) => /共同|一致|均|都|共识/.test(line))
      .slice(0, 12),
    conflicts: toConflicts(opinionSection),
    factChecks,
    finalAnswer:
      findSection(sections, ['最终综合答案', '最终答案']) ||
      sections.preamble?.trim() ||
      markdown.trim(),
    coreConclusions: bulletLines(findSection(sections, ['核心结论'])).slice(0, 12),
    recommendation: findSection(sections, ['最佳建议', '推荐执行方案']).slice(0, 8_000),
    uncertainties,
    sources: allowedSources,
    confidence,
  };
}
