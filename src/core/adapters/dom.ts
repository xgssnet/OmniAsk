/** 通用 DOM 工具：Shadow DOM 查询、元素等待、输入注入与文本提取。 */

export class AdapterError extends Error {
  constructor(
    public readonly code:
      | 'LOGIN_REQUIRED'
      | 'INPUT_NOT_FOUND'
      | 'SEND_FAILED'
      | 'RESPONSE_NOT_FOUND'
      | 'TIMEOUT'
      | 'CANCELLED'
      | 'UNSUPPORTED',
    message: string,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

/**
 * 自动发现回答时使用的通用候选选择器。
 * 站点 DOM 变化频繁，配置选择器失效时用它作为兜底，并按「提交前后文本变化」筛选真正的回答。
 */
export const TEXT_BLOCK_SELECTOR = [
  '[data-message-author-role]',
  '[data-role]',
  '[data-testid*="message"]',
  '[data-testid*="answer"]',
  '[data-testid*="markdown"]',
  '[class*="markdown"]',
  '[class*="message-content"]',
  '[class*="messageContent"]',
  '[class*="answer"]',
  '[class*="response"]',
  '[class*="prose"]',
  'article',
  'blockquote',
  'pre',
  'p',
  'li',
].join(',');

/** 收集所有可作为回答容器的根节点（含 open Shadow DOM）。 */
function collectRoots(): ParentNode[] {
  const roots: ParentNode[] = [document];
  const stack: ParentNode[] = [document];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const element of Array.from(current.querySelectorAll('*'))) {
      const shadow = element.shadowRoot;
      if (!shadow) continue;
      roots.push(shadow);
      stack.push(shadow);
    }
  }
  return roots;
}

/** 支持逗号分隔的多个候选选择器，并可穿透 open Shadow DOM。 */
export function queryAll(selector: string, includeShadow = true): Element[] {
  if (!selector?.trim()) return [];
  const parts = selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];

  const roots = includeShadow ? collectRoots() : [document as ParentNode];
  const result: Element[] = [];
  for (const root of roots) {
    for (const part of parts) {
      try {
        result.push(...Array.from(root.querySelectorAll(part)));
      } catch {
        // 非法选择器跳过，由调用方生成明确错误
      }
    }
  }
  return Array.from(new Set(result));
}

export function queryFirst(selector: string, includeShadow = true): Element | null {
  return queryAll(selector, includeShadow)[0] ?? null;
}

export function collectTextBlockCandidates(): Element[] {
  return queryAll(TEXT_BLOCK_SELECTOR);
}

export function isInsideEditable(element: Element): boolean {
  return element.closest('textarea, input, [contenteditable="true"], [role="textbox"]') !== null;
}

/** 过滤掉包含其他候选节点的父节点，避免同一段回答被拼接多次。 */
export function keepLeafNodes(nodes: Element[]): Element[] {
  return nodes.filter(
    (node) => !nodes.some((other) => other !== node && node.contains(other)),
  );
}

export function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

export function waitForElement(
  selector: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = queryFirst(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error, element?: Element) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (element) resolve(element);
    };
    const onAbort = () => finish(new AdapterError('CANCELLED', '任务已取消'));

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    observer = new MutationObserver(() => {
      const element = queryFirst(selector);
      if (element) finish(undefined, element);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    timer = setTimeout(
      () =>
        finish(
          new AdapterError(
            'TIMEOUT',
            `等待元素超时（${Math.round(timeoutMs / 1000)}s）：${selector}`,
          ),
        ),
      timeoutMs,
    );
  });
}

/** 兼容 React 受控组件：使用原生 setter 后派发 input 事件。 */
export function setInputValue(element: Element, value: string): void {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus();
    element.textContent = '';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: '' }));
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  throw new AdapterError('UNSUPPORTED', '输入框既不是 textarea/input，也不是 contenteditable');
}

/** 把 DOM 节点转成尽量保留结构的 Markdown 文本。 */
export function elementToMarkdown(element: Element): string {
  const blocks: string[] = [];
  const walkNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      blocks.push(node.textContent ?? '');
      return;
    }
    if (!(node instanceof Element)) return;

    const tag = node.tagName.toLowerCase();
    if (tag === 'pre') {
      const code = node.querySelector('code');
      const language = code?.className.match(/language-([\w-]+)/)?.[1] ?? '';
      blocks.push(`\n\n\`\`\`${language}\n${code?.textContent ?? node.textContent ?? ''}\n\`\`\`\n\n`);
      return;
    }
    if (tag === 'br') {
      blocks.push('\n');
      return;
    }
    if (tag === 'li') blocks.push('\n- ');
    if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote'].includes(tag)) {
      blocks.push('\n');
      if (/^h[1-4]$/.test(tag)) blocks.push(`${'#'.repeat(Number(tag[1]) + 1)} `);
    }
    if (tag === 'code') blocks.push('`');
    node.childNodes.forEach(walkNode);
    if (tag === 'code') blocks.push('`');
    if (['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote'].includes(tag)) {
      blocks.push('\n');
    }
  };
  walkNode(element);
  return blocks
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AdapterError('CANCELLED', '任务已取消'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AdapterError('CANCELLED', '任务已取消'));
      },
      { once: true },
    );
  });
}
