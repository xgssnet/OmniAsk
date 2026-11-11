import { BUILTIN_SITES } from '@/shared/sites';
import type { SiteConfig } from '@/shared/types';

/** 逗号分隔选择器按「用户值优先、内置新候选追加」合并去重。 */
export function mergeSelectorCandidates(saved?: string, defaults?: string): string {
  const split = (value?: string) =>
    (value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  return Array.from(new Set([...split(saved), ...split(defaults)])).join(', ');
}

/**
 * 归一化已保存的站点列表：
 * 用户在新版之前保存的旧选择器不会覆盖新增的内置候选，同时保留用户自己的编辑与启用状态。
 * UI 与 Service Worker 都通过它读取配置，避免两边看到不同的选择器。
 */
export function normalizeSites(stored: SiteConfig[]): SiteConfig[] {
  if (!Array.isArray(stored)) return BUILTIN_SITES;
  const byId = new Map(stored.map((site) => [site.id, site]));

  const builtins = BUILTIN_SITES.map((base) => {
    const saved = byId.get(base.id);
    if (!saved) return base;
    return {
      ...base,
      ...saved,
      selectors: {
        ...base.selectors,
        ...saved.selectors,
        input: mergeSelectorCandidates(saved.selectors.input, base.selectors.input),
        sendButton: mergeSelectorCandidates(saved.selectors.sendButton, base.selectors.sendButton),
        response: mergeSelectorCandidates(saved.selectors.response, base.selectors.response),
      },
    };
  });
  return [...builtins, ...stored.filter((site) => site.custom)];
}

export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** 每次提问使用的新会话地址；未单独配置时回退到站点首页。 */
export function resolveNewChatUrl(site: SiteConfig): string {
  return site.newChatUrl?.trim() || site.url;
}

/** 转成 Chrome 权限/内容脚本使用的 match pattern。 */
export function siteOriginPattern(url: string): string {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return '';
  }
}

/** 自定义站点需要用户显式授予运行时主机权限，否则无法注入内容脚本。 */
export async function requestSitePermission(url: string): Promise<boolean> {
  const origin = siteOriginPattern(url);
  if (!origin) return false;
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return true;
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

export function validateSite(site: SiteConfig): string[] {
  const errors: string[] = [];
  if (!site.name.trim()) errors.push('网站名称不能为空');
  try {
    const url = new URL(site.url);
    if (!/^https?:$/.test(url.protocol)) errors.push('URL 必须使用 http 或 https');
  } catch {
    errors.push('URL 格式不正确');
  }
  if (!site.selectors.input.trim()) errors.push('输入框选择器不能为空');
  if (!site.selectors.response.trim()) errors.push('回答内容选择器不能为空');
  return errors;
}

/** 创建自定义网站配置。所有选择器都可由用户在设置页修改。 */
export function createCustomSite(input: {
  name: string;
  url: string;
  icon?: string;
}): SiteConfig {
  const url = normalizeSiteUrl(input.url);
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim() || '自定义站点',
    url,
    type: 'web',
    icon: (input.icon || input.name.trim().slice(0, 1) || 'A').slice(0, 2),
    accent: '#6366f1',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: true,
    selectors: {
      input: 'textarea, div[contenteditable="true"]',
      sendButton: 'button[type="submit"], button[aria-label*="发送"], button[aria-label*="Send"]',
      response: '.markdown-body, [class*="markdown"], [class*="message-content"]',
    },
  };
}
