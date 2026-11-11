import type { SiteConfig } from '@/shared/types';
import { queryAll, queryFirst } from './dom';

export interface ShortcutSpec {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** 解析 "ctrl+shift+k" 形式的快捷键。 */
export function parseShortcut(input: string): ShortcutSpec | null {
  if (!input?.trim()) return null;
  const parts = input
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const key = parts[parts.length - 1];
  if (key.length !== 1 || !/[a-z0-9]/.test(key)) return null;
  const modifiers = parts.slice(0, -1);

  return {
    key,
    ctrl: modifiers.includes('ctrl') || modifiers.includes('control'),
    shift: modifiers.includes('shift'),
    alt: modifiers.includes('alt'),
    meta:
      modifiers.includes('meta') ||
      modifiers.includes('cmd') ||
      modifiers.includes('command'),
  };
}

/** 在页面主文档中派发一次组合键（含 keyCode/which 兼容老旧监听）。 */
export function dispatchShortcut(spec: ShortcutSpec): void {
  const key = spec.shift ? spec.key.toUpperCase() : spec.key;
  const init: KeyboardEventInit = {
    key,
    code: `Key${spec.key.toUpperCase()}`,
    ctrlKey: spec.ctrl,
    shiftKey: spec.shift,
    altKey: spec.alt,
    metaKey: spec.meta,
    bubbles: true,
    cancelable: true,
  };
  const target =
    document.activeElement instanceof HTMLElement ? document.activeElement : document.body;

  for (const type of ['keydown', 'keyup']) {
    const event = new KeyboardEvent(type, init);
    const keyCode = spec.key.toUpperCase().charCodeAt(0);
    Object.defineProperty(event, 'keyCode', { get: () => keyCode });
    Object.defineProperty(event, 'which', { get: () => keyCode });
    target.dispatchEvent(event);
  }
}

/** 按可见文字/aria-label/title 定位并点击「新建对话」按钮，支持 open Shadow DOM。 */
export function clickByButtonTexts(texts: string[]): boolean {
  const candidates = queryAll('button, a, [role="button"], [tabindex="0"], [aria-label]');
  for (const text of texts) {
    const needle = text.trim().toLowerCase();
    if (!needle) continue;
    const match = candidates.find((element) => {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      const label = (
        element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.textContent ||
        ''
      )
        .trim()
        .toLowerCase();
      return label === needle || label.includes(needle);
    });
    if (match instanceof HTMLElement) {
      match.click();
      return true;
    }
  }
  return false;
}

export interface NewChatResult {
  ok: boolean;
  method: string;
}

/** 按「CSS 选择器 → 快捷键 → 按钮文案」依次尝试，命中一种即停止。 */
export function performNewChat(site: SiteConfig): NewChatResult {
  const selector = site.newChatButton?.trim();
  if (selector) {
    const element = queryFirst(selector);
    if (element instanceof HTMLElement) {
      element.click();
      return { ok: true, method: `按钮选择器 ${selector}` };
    }
  }

  const shortcut = parseShortcut(site.newChatShortcut ?? '');
  if (shortcut) {
    dispatchShortcut(shortcut);
    return { ok: true, method: `快捷键 ${site.newChatShortcut}` };
  }

  if (site.newChatButtonTexts?.length && clickByButtonTexts(site.newChatButtonTexts)) {
    return { ok: true, method: `按钮文案 ${site.newChatButtonTexts.join(' / ')}` };
  }

  return { ok: false, method: '未找到可用的新建会话方式' };
}
