import type { SiteConfig } from '@/shared/types';
import { BaseAdapter } from './BaseAdapter';
import { CustomAdapter } from './CustomAdapter';
import {
  ChatGPTAdapter,
  ChatglmAdapter,
  ClaudeAdapter,
  DeepSeekAdapter,
  DoubaoAdapter,
  GeminiAdapter,
  KimiAdapter,
  QwenAdapter,
  YuanbaoAdapter,
} from './builtin';

type AdapterConstructor = new (site: SiteConfig) => BaseAdapter;

const REGISTRY = new Map<string, AdapterConstructor>([
  ['chatgpt', ChatGPTAdapter],
  ['claude', ClaudeAdapter],
  ['gemini', GeminiAdapter],
  ['deepseek', DeepSeekAdapter],
  ['doubao', DoubaoAdapter],
  ['qwen', QwenAdapter],
  ['yuanbao', YuanbaoAdapter],
  ['kimi', KimiAdapter],
  ['chatglm', ChatglmAdapter],
]);

export function createAdapter(site: SiteConfig): BaseAdapter {
  const Constructor = REGISTRY.get(site.id);
  return Constructor ? new Constructor(site) : new CustomAdapter(site);
}

export function hasDedicatedAdapter(siteId: string): boolean {
  return REGISTRY.has(siteId);
}

export function dedicatedAdapterIds(): string[] {
  return [...REGISTRY.keys()];
}

/** 允许后续以插件方式注册新适配器，无需修改调度逻辑。 */
export function registerAdapter(siteId: string, constructor: AdapterConstructor): void {
  REGISTRY.set(siteId, constructor);
}
