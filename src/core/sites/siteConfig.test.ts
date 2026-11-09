import { describe, expect, it } from 'vitest';
import {
  createCustomSite,
  mergeSelectorCandidates,
  normalizeSiteUrl,
  normalizeSites,
  siteOriginPattern,
  validateSite,
} from './siteConfig';
import { BUILTIN_SITES } from '@/shared/sites';
import type { SiteConfig } from '@/shared/types';

describe('siteConfig', () => {
  it('为缺少协议的地址补全 https', () => {
    expect(normalizeSiteUrl('example.com/chat')).toBe('https://example.com/chat');
    expect(normalizeSiteUrl(' http://localhost:3000 ')).toBe('http://localhost:3000');
  });

  it('生成最小权限的 match pattern', () => {
    expect(siteOriginPattern('https://example.com/chat?x=1')).toBe('https://example.com/*');
    expect(siteOriginPattern('not a url')).toBe('');
  });

  it('校验必填项与 URL 协议', () => {
    const site = createCustomSite({ name: '自建助手', url: 'example.com/chat' });
    expect(validateSite(site)).toEqual([]);
    expect(validateSite({ ...site, name: '' })[0]).toContain('名称');
    expect(validateSite({ ...site, url: 'ftp://example.com' })[0]).toContain('http');
    expect(validateSite({ ...site, selectors: { ...site.selectors, input: '' } })[0]).toContain('输入框');
  });

  it('自定义站点使用唯一 id 且带有可用默认选择器', () => {
    const first = createCustomSite({ name: 'A', url: 'a.test' });
    const second = createCustomSite({ name: 'A', url: 'a.test' });
    expect(first.id).not.toBe(second.id);
    expect(first.custom).toBe(true);
    expect(first.selectors.input).toContain('textarea');
    expect(first.selectors.response.length).toBeGreaterThan(0);
  });

  it('合并候选选择器时保留用户值并去重', () => {
    expect(mergeSelectorCandidates('.old', '.old, .new')).toBe('.old, .new');
    expect(mergeSelectorCandidates(undefined, '.a, .b')).toBe('.a, .b');
  });

  it('老配置会合并进新版内置候选，同时保留用户设置与自定义站点', () => {
    const custom = createCustomSite({ name: '自建', url: 'self.test' });
    const legacyChatgpt: SiteConfig = {
      ...BUILTIN_SITES[0],
      enabled: false,
      selectors: {
        ...BUILTIN_SITES[0].selectors,
        response: '[data-message-author-role="assistant"]',
      },
    };
    const result = normalizeSites([legacyChatgpt, custom]);
    const chatgpt = result.find((site) => site.id === 'chatgpt');
    expect(chatgpt?.enabled).toBe(false);
    expect(chatgpt?.selectors.response).toContain('[data-message-author-role="assistant"]');
    expect(chatgpt?.selectors.response).toContain('.markdown');
    expect(result.some((site) => site.id === custom.id)).toBe(true);
    expect(result.some((site) => site.id === 'doubao')).toBe(true);
  });
});
