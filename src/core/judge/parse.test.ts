import { describe, expect, it } from 'vitest';
import { extractUrls, factCheckFromMarkdown } from './factcheck';
import { bulletLines, parseAnalysis, splitSections, type AnalysisMeta } from './parse';
import type { ModelResponse } from '@/shared/types';

const markdown = `# 最终综合答案

使用官方仓库安装。

# 核心结论

- 应使用官方软件源
- 配置完成后需重启服务

# 多模型观点分析

- 多个模型均建议使用官方源
- 版本要求存在争议：模型 A 说 1.0，模型 B 说 2.0

# 事实核查

- 已验证事实：官方文档确认了仓库地址 https://docs.docker.com/engine/install/
- 尚无法验证：镜像加速地址的有效性

# 最佳建议

按官方文档执行安装。

# 不确定性说明

- 镜像源可用性可能变化
`;

const responses: ModelResponse[] = [
  {
    siteId: 'chatgpt',
    status: 'completed',
    content: '参考 https://docs.docker.com/engine/install/ 进行安装。可能需要代理。',
    attempts: 1,
  },
  { siteId: 'claude', status: 'failed', content: '', error: '未登录', attempts: 1 },
];

const meta: AnalysisMeta = {
  questionId: 'task-1',
  judgeModel: 'test-model',
  responses,
  siteNames: { chatgpt: 'ChatGPT', claude: 'Claude' },
  onlineFactCheck: false,
};

describe('extractUrls', () => {
  it('只返回文本中真实出现的 URL 并去重', () => {
    const urls = extractUrls([
      '见 https://example.com/a 和 https://example.com/a，以及 https://docs.test.org。',
    ]);
    expect(urls).toContain('https://example.com/a');
    expect(urls).toContain('https://docs.test.org/');
    expect(urls).toHaveLength(2);
  });

  it('不会凭空生成来源', () => {
    expect(extractUrls(['没有链接的一段文字'])).toEqual([]);
  });
});

describe('factCheckFromMarkdown', () => {
  it('缺少来源时全部标记为尚未验证', () => {
    const items = factCheckFromMarkdown('- 某个没有证据的结论', []);
    expect(items[0].level).toBe('unverified');
    expect(items[0].evidence).toContain('尚未');
    expect(items[0].sources).toEqual([]);
  });

  it('空章节返回明确的未验证说明', () => {
    const items = factCheckFromMarkdown('', []);
    expect(items[0].level).toBe('unverified');
  });
});

describe('Markdown 解析', () => {
  it('按标题切分章节', () => {
    const sections = splitSections(markdown);
    expect(sections['最终综合答案']).toContain('使用官方仓库安装');
    expect(sections['核心结论']).toContain('官方软件源');
  });

  it('提取列表项', () => {
    expect(bulletLines('- 第一项\n- 第二项')).toEqual(['第一项', '第二项']);
  });

  it('生成结构化结果且来源不越界', () => {
    const result = parseAnalysis(markdown, meta);
    expect(result.finalAnswer).toContain('使用官方仓库安装');
    expect(result.coreConclusions).toHaveLength(2);
    expect(result.consensus.join(' ')).toContain('官方源');
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.sources).toEqual(extractUrls(responses.map((item) => item.content)));
    expect(result.structured).toHaveLength(1);
    expect(result.recommendation).toContain('官方文档');
  });

  it('置信度不会给出未经验证的高评级', () => {
    const highRisk = parseAnalysis('没有章节的一段推测性文字', meta);
    expect(highRisk.confidence).not.toBe('high');
    expect(highRisk.uncertainties.join(' ')).toContain('尚未');
  });
});
