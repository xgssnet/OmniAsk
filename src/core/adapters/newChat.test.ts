// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clickByButtonTexts,
  dispatchShortcut,
  parseShortcut,
  performNewChat,
} from './newChat';
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
  selectors: { input: 'textarea', sendButton: 'button', response: '.answer' },
  timeoutMs: 120_000,
  custom: true,
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('parseShortcut', () => {
  it('解析 ctrl+o', () => {
    expect(parseShortcut('ctrl+o')).toEqual({
      key: 'o',
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
    });
  });

  it('解析 ctrl+shift+k 并忽略大小写', () => {
    expect(parseShortcut('CTRL+SHIFT+K')).toMatchObject({ key: 'k', ctrl: true, shift: true });
  });

  it('支持 meta 别名', () => {
    expect(parseShortcut('cmd+k')).toMatchObject({ key: 'k', meta: true });
  });

  it('缺少修饰键或多字符键时返回 null', () => {
    expect(parseShortcut('k')).toBeNull();
    expect(parseShortcut('ctrl+enter')).toBeNull();
    expect(parseShortcut('')).toBeNull();
  });
});

describe('dispatchShortcut', () => {
  it('派发带修饰键的事件并冒泡到 document', () => {
    document.body.innerHTML = '<textarea id="input"></textarea>';
    (document.getElementById('input') as HTMLElement).focus();
    const handler = vi.fn();
    document.addEventListener('keydown', handler);

    dispatchShortcut(parseShortcut('ctrl+shift+k')!);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as KeyboardEvent;
    expect(event.ctrlKey).toBe(true);
    expect(event.shiftKey).toBe(true);
    expect(event.key).toBe('K');
    expect(event.code).toBe('KeyK');
    expect(event.keyCode).toBe('K'.charCodeAt(0));
    document.removeEventListener('keydown', handler);
  });
});

describe('clickByButtonTexts', () => {
  it('按按钮文字点击', () => {
    document.body.innerHTML = '<button id="new">新聊天</button>';
    const handler = vi.fn();
    document.getElementById('new')!.addEventListener('click', handler);
    expect(clickByButtonTexts(['新聊天'])).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('支持 aria-label 与多个候选文案', () => {
    document.body.innerHTML = '<div role="button" aria-label="新建对话" id="n"></div>';
    const handler = vi.fn();
    document.getElementById('n')!.addEventListener('click', handler);
    expect(clickByButtonTexts(['不存在的按钮', '新建对话'])).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('隐藏元素会被跳过', () => {
    document.body.innerHTML = '<button hidden>新聊天</button>';
    expect(clickByButtonTexts(['新聊天'])).toBe(false);
  });
});

describe('performNewChat', () => {
  it('优先使用 CSS 选择器', () => {
    document.body.innerHTML = '<button id="by-selector">新聊天</button>';
    const handler = vi.fn();
    document.getElementById('by-selector')!.addEventListener('click', handler);
    const result = performNewChat({
      ...baseSite,
      newChatButton: '#by-selector',
      newChatShortcut: 'ctrl+o',
    });
    expect(result.ok).toBe(true);
    expect(result.method).toContain('按钮选择器');
    expect(handler).toHaveBeenCalled();
  });

  it('没有选择器时派发快捷键', () => {
    const handler = vi.fn();
    document.addEventListener('keydown', handler);
    const result = performNewChat({ ...baseSite, newChatShortcut: 'ctrl+j' });
    expect(result.ok).toBe(true);
    expect((handler.mock.calls[0][0] as KeyboardEvent).ctrlKey).toBe(true);
    document.removeEventListener('keydown', handler);
  });

  it('未配置任何方式时明确返回失败', () => {
    expect(performNewChat(baseSite).ok).toBe(false);
  });
});
