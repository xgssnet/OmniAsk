import type { FactCheckItem, VerificationLevel } from '@/shared/types';

const URL_PATTERN = /https?:\/\/[^\s)<>「」【】"'`（），。；：！？、]+/g;

/** 只提取回答中真实出现过的 URL，绝不生成或猜测来源。 */
export function extractUrls(texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(URL_PATTERN)) {
      const cleaned = match[0].replace(/[.,;:!?，。；：！？、]+$/, '');
      try {
        const url = new URL(cleaned);
        if (url.protocol === 'http:' || url.protocol === 'https:') found.add(url.toString());
      } catch {
        // 忽略非 URL 文本
      }
    }
  }
  return [...found];
}

export function classifyFactLine(line: string): VerificationLevel {
  if (/已验证事实|官方(文档|公告)已确认/.test(line)) return 'verified';
  if (/有较强依据|证据充分|多来源一致/.test(line)) return 'well-supported';
  if (/合理推断|推断|推测/.test(line)) return 'inference';
  if (/存在争议|有分歧|冲突|互相矛盾/.test(line)) return 'disputed';
  return 'unverified';
}

/** 从「事实核查」章节解析分类；没有外部来源的结论一律标为尚未验证。 */
export function factCheckFromMarkdown(
  section: string,
  allowedSources: string[],
): FactCheckItem[] {
  if (!section.trim()) {
    return [
      {
        claim: '裁决模型未输出事实核查章节',
        level: 'unverified',
        evidence: '无法对结论做外部验证，所有结论均未标记为已验证',
        sources: [],
      },
    ];
  }

  return section
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 6)
    .slice(0, 40)
    .map((line) => {
      const level = classifyFactLine(line);
      return {
        claim: line.slice(0, 400),
        level,
        evidence:
          level === 'unverified'
            ? '未提供可独立核验的外部来源，该结论尚未经过外部验证'
            : '裁决模型给出的分类依据见综合答案原文',
        sources: level === 'verified' ? allowedSources.slice(0, 3) : [],
      };
    });
}
