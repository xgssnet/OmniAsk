// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { BaseAdapter } from './BaseAdapter';
import type { SiteConfig } from '@/shared/types';

const baseSite: SiteConfig = {
  id: 'test',
  name: '测试站点',
  url: 'https://example.com/chat',
  type: 'web',
  icon: 'T',
  accent: '#6366f1',
  enabled: true,
  participateInAnalysis: true,
  supportsStreaming: true,
  timeoutMs: 120_000,
  custom: true,
  selectors: {
    input: 'textarea',
    sendButton: 'button[type="submit"]',
    response: '.configured-answer',
  },
};

class ProbeAdapter extends BaseAdapter {
  setQuestion(question: string): void {
    this.currentQuestion = question;
  }
  snapshot(): void {
    this.markBaseline();
  }
  extract(): string {
    return this.extractAnswer();
  }
  get fallbackUsed(): boolean {
    return this.usedFallback;
  }
}

const QUESTION = 'Rocky Linux 9 如何部署 Docker 并配置国内镜像源？';

function prepare(responseSelector = '.configured-answer'): ProbeAdapter {
  document.body.innerHTML = '<textarea id="prompt"></textarea><div id="thread"></div>';
  const adapter = new ProbeAdapter({
    ...baseSite,
    selectors: { ...baseSite.selectors, response: responseSelector },
  });
  adapter.setQuestion(QUESTION);
  adapter.snapshot();
  return adapter;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('回答提取', () => {
  it('配置选择器命中时直接返回，不触发自动发现', () => {
    const adapter = prepare();
    document.getElementById('thread')!.innerHTML =
      '<div class="configured-answer">配置选择器命中了回答内容，这段文本足够长以便通过提取逻辑的过滤条件。</div>';
    expect(adapter.extract()).toContain('配置选择器命中了回答内容');
    expect(adapter.fallbackUsed).toBe(false);
  });

  it('配置选择器失效时通过提交前后文本变化自动发现回答（修复超时根因）', () => {
    const adapter = prepare('.does-not-exist');
    document.getElementById('thread')!.innerHTML = [
      `<p class="message-user">${QUESTION}</p>`,
      '<div class="answer-body"><p>建议使用 Docker 官方软件仓库安装，然后配置 daemon.json 并重启服务，这是一段足够长的回答内容用于验证自动发现。</p></div>',
    ].join('');

    const text = adapter.extract();
    expect(text).toContain('Docker 官方软件仓库');
    expect(text).not.toContain('Rocky Linux 9 如何部署');
    expect(adapter.fallbackUsed).toBe(true);
  });

  it('多候选命中父子节点时只保留最深层，避免回答重复', () => {
    const adapter = prepare('.answer-outer, .answer-inner');
    document.getElementById('thread')!.innerHTML =
      '<div class="answer-outer"><div class="answer-inner">这是唯一的一段回答文本，内容足够长用来验证父子节点去重逻辑是否生效。</div></div>';
    const text = adapter.extract();
    expect(text.split('这是唯一的一段回答文本').length - 1).toBe(1);
  });

  it('编辑器内的文本不会被误判为模型回答', () => {
    const adapter = prepare('.does-not-exist');
    document.getElementById('thread')!.innerHTML =
      '<div contenteditable="true" class="answer">输入框里的一段较长文本内容，不应该被误判为模型回答内容。</div>';
    expect(adapter.extract()).not.toContain('不应该被误判为模型回答内容');
  });

  it('提交前已存在的历史回答不会被当作本次结果', () => {
    const adapter = prepare('.does-not-exist');
    document.getElementById('thread')!.innerHTML =
      '<div class="answer-body"><p>这是一段历史回答，内容足够长，用来验证基线机制不会把旧回答当成新回答。</p></div>';
    adapter.snapshot();
    expect(adapter.extract()).toBe('');
  });

  it('测试选择器返回匹配数与示例文本', async () => {
    const adapter = prepare();
    document.getElementById('thread')!.innerHTML =
      '<div class="configured-answer">示例回答文本内容，用于验证诊断信息。</div>';
    const checks = await adapter.testSelectors();
    const answer = checks.find((check) => check.name === '回答区域');
    expect(answer?.count).toBe(1);
    expect(answer?.sample).toContain('示例回答文本');
    expect(checks.some((check) => check.required === false)).toBe(true);
  });
});
