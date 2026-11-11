import type { SiteConfig } from './types';

/**
 * 内置站点元数据。
 *
 * 注意：selectors 仅为「初始候选值」，用于自定义配置界面的默认填充，
 * 尚未经过真实页面验证。P4 阶段会为每个站点实现独立适配器并逐一实测，
 * 在此之前不得宣称任何站点已兼容。
 */
export const BUILTIN_SITES: SiteConfig[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chatgpt.com/',
    newChatButtonTexts: ['新聊天', 'New chat', '新建聊天'],
    type: 'builtin',
    icon: 'G',
    accent: '#10a37f',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: '#prompt-textarea, textarea, div[contenteditable="true"]',
      sendButton: 'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="发送"]',
      response:
        '[data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] [class*="markdown"], [data-message-author-role="assistant"], [data-testid*="assistant"] [class*="markdown"]',
      streamingIndicator: 'button[data-testid="stop-button"], button[aria-label*="Stop"]',
    },
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai/new',
    newChatShortcut: 'ctrl+shift+k',
    type: 'builtin',
    icon: 'C',
    accent: '#d97757',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: 'div[contenteditable="true"], textarea',
      sendButton: 'button[aria-label*="Send"], button[aria-label*="发送"], button[data-testid*="send"]',
      response:
        '.font-claude-message, [class*="claude-message"], [data-is-streaming] [class*="markdown"], div.prose, [class*="prose"] [class*="markdown"], [data-testid*="message"] [class*="markdown"]',
      streamingIndicator: 'button[aria-label*="Stop"], button[aria-label*="停止"], [data-is-streaming="true"]',
    },
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com/app',
    newChatShortcut: 'ctrl+o',
    type: 'builtin',
    icon: '✦',
    accent: '#4285f4',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: 'div[contenteditable="true"], .ql-editor',
      sendButton: 'button[aria-label*="Send"], button[mattooltip*="Send"]',
      response: '.model-response-text, message-content',
      streamingIndicator: 'button[aria-label*="Stop"]',
    },
  },
  {
    id: 'doubao',
    name: '豆包',
    url: 'https://www.doubao.com/chat',
    newChatShortcut: 'ctrl+shift+k',
    type: 'builtin',
    icon: '豆',
    accent: '#4d6bfe',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: 'textarea, div[contenteditable="true"]',
      sendButton: 'button[data-testid="chat_input_send_button"], button[aria-label*="发送"], button[data-testid*="send"]',
      response:
        '[data-testid="message_text_content"], [data-testid*="message_text"], [class*="message-content"], [class*="markdown-body"], [class*="markdown"]',
    },
  },
  {
    id: 'qwen',
    name: '通义千问',
    url: 'https://chat.qwen.ai/',
    newChatButtonTexts: ['新建对话', 'New chat'],
    type: 'builtin',
    icon: '通',
    accent: '#615ced',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: 'textarea, div[contenteditable="true"]',
      sendButton: 'button[aria-label*="发送"], button[aria-label*="Send"]',
      response: '.markdown-body, [class*="answerContainer"]',
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://chat.deepseek.com/',
    newChatShortcut: 'ctrl+j',
    type: 'builtin',
    icon: 'D',
    accent: '#4d6bfe',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: 'textarea',
      sendButton: 'div[role="button"][aria-disabled="false"]',
      response: '.markdown-body, .ds-markdown',
    },
  },
  {
    id: 'yuanbao',
    name: '腾讯元宝',
    url: 'https://yuanbao.tencent.com/',
    newChatButtonTexts: ['新建对话', '新对话'],
    type: 'builtin',
    icon: '元',
    accent: '#07c160',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: 'textarea, div[contenteditable="true"]',
      sendButton: 'button[aria-label*="发送"]',
      response: '[class*="markdown"], .hyc-content-md',
    },
  },
  {
    id: 'kimi',
    name: 'Kimi',
    url: 'https://www.kimi.com/',
    newChatShortcut: 'ctrl+k',
    type: 'builtin',
    icon: 'K',
    accent: '#1a1a1a',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: 'textarea, div[contenteditable="true"]',
      sendButton: 'button[aria-label*="发送"], button[data-testid*="send"]',
      response: '[class*="markdown"], .markdown-body',
    },
  },
  {
    id: 'chatglm',
    name: '智谱清言',
    url: 'https://chatglm.cn/',
    newChatButtonTexts: ['新对话', '新建对话'],
    type: 'builtin',
    icon: '智',
    accent: '#3859ff',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: true,
    timeoutMs: 120_000,
    custom: false,
    selectors: {
      input: 'textarea, div[contenteditable="true"]',
      sendButton: 'button[aria-label*="发送"]',
      response: '.markdown-body, [class*="answer"]',
    },
  },
];

/** 把站点 URL 转成最小权限的 match pattern。 */
export function toMatchPattern(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}/*`;
}

export const BUILTIN_MATCH_PATTERNS = BUILTIN_SITES.map((site) =>
  toMatchPattern(site.url),
);
