import type { ModelResponse, SiteConfig } from '@/shared/types';
import {
  AdapterError,
  collectTextBlockCandidates,
  elementToMarkdown,
  isInsideEditable,
  keepLeafNodes,
  normalizeForCompare,
  queryAll,
  queryFirst,
  setInputValue,
  sleep,
  TEXT_BLOCK_SELECTOR,
  waitForElement,
} from './dom';

export interface AdapterContext {
  taskId: string;
  question: string;
  signal: AbortSignal;
  onProgress: (patch: Partial<ModelResponse>) => void;
}

export interface AdapterRunResult {
  content: string;
  durationMs: number;
}

export interface LoginCheck {
  loggedIn: boolean;
  reliable: boolean;
  detail: string;
}

export interface SelectorCheck {
  name: string;
  found: boolean;
  detail: string;
  /** 当前页面匹配到的节点数，便于校准选择器 */
  count: number;
  /** 最后一个匹配节点的文本片段 */
  sample: string;
  /** false 表示仅作为诊断参考，不参与「是否通过」判定 */
  required?: boolean;
}

const STABLE_MS = 2_500;
const MIN_ANSWER_MS = 1_500;
const POLL_MS = 200;
const EXTRACT_THROTTLE_MS = 120;

/**
 * 所有网站适配器的公共实现。
 * 提取分两层：先用站点配置的 CSS 选择器，失效时回退到「提交前后文本变化」的自动发现，
 * 这样网站改版或选择器过时不会直接导致 120 秒空等。
 */
export abstract class BaseAdapter {
  readonly id: string;
  protected baseline: Element | null = null;
  protected baselineTexts = new Map<Element, string>();
  protected currentQuestion = '';
  /** 本次是否使用了自动发现回退，供诊断输出 */
  protected usedFallback = false;
  /** 自动发现的启用时间：先等待配置选择器产生内容，避免误抓页面其它动态文字 */
  protected fallbackAllowedAt = 0;

  constructor(protected readonly site: SiteConfig) {
    this.id = site.id;
  }

  protected get selectors(): SiteConfig['selectors'] {
    return this.site.selectors;
  }

  protected async prepare(_ctx: AdapterContext): Promise<void> {
    // 默认无需处理
  }

  /** 等待发送按钮由 disabled 变为可用，避免输入刚注入时点击落空。 */
  protected async waitForUsableButton(
    selector: string,
    signal: AbortSignal,
    timeoutMs = 2_500,
  ): Promise<HTMLElement | null> {
    if (!selector) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = queryFirst(selector);
      if (
        element instanceof HTMLElement &&
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-disabled') !== 'true'
      ) {
        return element;
      }
      if (signal.aborted) return null;
      await sleep(120, signal);
    }
    return null;
  }

  protected pressEnter(input: Element): void {
    if (input instanceof HTMLElement) input.focus();
    for (const type of ['keydown', 'keyup']) {
      input.dispatchEvent(
        new KeyboardEvent(type, {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  }

  protected async submitQuestion(input: Element, ctx: AdapterContext): Promise<void> {
    const button = await this.waitForUsableButton(this.selectors.sendButton, ctx.signal);
    if (button) {
      button.click();
      return;
    }
    this.pressEnter(input);
    await sleep(50, ctx.signal);
  }

  /** 记录提交前的回答基线与全部文本块快照。 */
  protected markBaseline(): void {
    const selector = this.selectors.responseContainer || this.selectors.response;
    const nodes = queryAll(selector);
    this.baseline = nodes[nodes.length - 1] ?? null;

    this.baselineTexts.clear();
    for (const element of collectTextBlockCandidates()) {
      if (isInsideEditable(element)) continue;
      this.baselineTexts.set(element, (element.textContent ?? '').trim());
    }
    this.usedFallback = false;
  }

  /** 第一层：站点配置的选择器（多候选用逗号分隔）。 */
  private extractConfigured(): string {
    const selector = this.selectors.responseContainer || this.selectors.response;
    const nodes = queryAll(selector);
    const index = this.baseline ? nodes.indexOf(this.baseline) : -1;
    const candidates =
      index >= 0
        ? nodes.slice(index + 1)
        : nodes.filter((node) => {
            const before = this.baselineTexts.get(node);
            return before === undefined || before !== (node.textContent ?? '').trim();
          });
    const leaves = keepLeafNodes(candidates);
    return Array.from(
      new Set(leaves.map((node) => elementToMarkdown(node)).filter(Boolean)),
    ).join('\n\n');
  }

  /** 第二层：不依赖站点选择器的自动发现，只取提交后新增或文本发生变化的深层文本块。 */
  private discoverAnswer(): string {
    const question = normalizeForCompare(this.currentQuestion);
    const candidates = collectTextBlockCandidates().filter((el) => !isInsideEditable(el));

    const changed = candidates.filter((element) => {
      const text = (element.textContent ?? '').trim();
      if (text.length < 25) return false;
      const before = this.baselineTexts.get(element);
      if (before !== undefined && before === text) return false;
      const flat = normalizeForCompare(text);
      // 排除用户自己发出的消息气泡
      const isUserMessage =
        flat === question ||
        (question.length > 8 && flat.includes(question.slice(0, 60))) ||
        (question.length > 8 && question.includes(flat.slice(0, 60)));
      return !isUserMessage;
    });

    const leaves = keepLeafNodes(changed);
    const texts = Array.from(
      new Set(leaves.map((element) => elementToMarkdown(element)).filter((text) => text.length > 20)),
    );
    return texts.join('\n\n');
  }

  protected extractAnswer(): string {
    const configured = this.extractConfigured();
    if (configured.trim()) return configured;
    if (Date.now() < this.fallbackAllowedAt) return '';

    const discovered = this.discoverAnswer();
    if (discovered.trim()) {
      this.usedFallback = true;
      return discovered;
    }
    return '';
  }

  protected isGenerating(): boolean {
    if (!this.selectors.streamingIndicator) return false;
    return queryFirst(this.selectors.streamingIndicator) !== null;
  }

  protected isCompletedByRule(): boolean {
    if (!this.selectors.completionIndicator) return false;
    return queryFirst(this.selectors.completionIndicator) !== null;
  }

  async checkLogin(): Promise<LoginCheck> {
    const { loggedIn, loggedOut } = this.selectors;
    if (loggedOut && queryFirst(loggedOut)) {
      return { loggedIn: false, reliable: true, detail: '检测到未登录标记元素' };
    }
    if (loggedIn && queryFirst(loggedIn)) {
      return { loggedIn: true, reliable: true, detail: '检测到已登录标记元素' };
    }
    const url = location.href.toLowerCase();
    if (/\/login|\/signin|\/sign-in|\/auth|\/passport/.test(url)) {
      return { loggedIn: false, reliable: true, detail: '当前位于登录页' };
    }
    if (queryFirst('input[type="password"]')) {
      return { loggedIn: false, reliable: true, detail: '检测到密码输入框' };
    }
    return {
      loggedIn: true,
      reliable: false,
      detail: '未配置可靠的登录规则，无法自动判断，请在设置中手动确认已登录',
    };
  }

  async testSelectors(): Promise<SelectorCheck[]> {
    const build = (name: string, selector: string, required = true): SelectorCheck => {
      const nodes = queryAll(selector);
      const last = nodes[nodes.length - 1];
      return {
        name,
        found: nodes.length > 0,
        detail: selector || '未配置（将使用 Enter 发送）',
        count: nodes.length,
        sample: last ? (last.textContent ?? '').trim().slice(0, 100) : '',
        required,
      };
    };
    return [
      build('输入框', this.selectors.input),
      build('发送按钮', this.selectors.sendButton),
      build('回答区域', this.selectors.response),
      build('通用候选（自动发现回退）', TEXT_BLOCK_SELECTOR, false),
    ];
  }

  /** 超时时给出可操作的诊断，而不是只重复「请检查选择器」。 */
  protected describeFailure(): string {
    const configured = queryAll(this.selectors.response).length;
    const candidates = collectTextBlockCandidates().length;
    const input = queryFirst(this.selectors.input);
    const inputText =
      input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement
        ? input.value
        : (input?.textContent ?? '');
    const notSent =
      this.currentQuestion.length > 8 &&
      normalizeForCompare(inputText).includes(normalizeForCompare(this.currentQuestion).slice(0, 40));

    return [
      `配置选择器当前匹配 ${configured} 个节点，通用候选 ${candidates} 个`,
      notSent ? '；输入框仍保留问题文本，问题可能没有发送成功' : '',
      '。请依次确认：① 问题确实出现在对话中；② 回答不在 iframe / closed Shadow DOM 内；③ 在「模型管理」用「测试选择器」查看匹配数并校准。',
      this.usedFallback ? '（本次曾命中自动发现回退）' : '',
    ].join('');
  }

  async run(ctx: AdapterContext): Promise<AdapterRunResult> {
    const startedAt = Date.now();
    this.currentQuestion = ctx.question;
    this.fallbackAllowedAt = Date.now() + 15_000;
    ctx.onProgress({ status: 'checking-login' });

    const login = await this.checkLogin();
    if (login.reliable && !login.loggedIn) {
      throw new AdapterError('LOGIN_REQUIRED', `请先登录 ${this.site.name}：${login.detail}`);
    }

    await this.prepare(ctx);
    const input = await waitForElement(
      this.selectors.input,
      Math.min(this.site.timeoutMs, 20_000),
      ctx.signal,
    );
    ctx.onProgress({ status: 'submitting' });
    this.markBaseline();
    setInputValue(input, ctx.question);
    await sleep(300, ctx.signal);
    await this.submitQuestion(input, ctx);

    ctx.onProgress({ status: 'streaming', content: '' });
    const content = await this.observeAnswer(ctx);
    return { content, durationMs: Date.now() - startedAt };
  }

  private observeAnswer(ctx: AdapterContext): Promise<string> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let observer: MutationObserver | undefined;
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
      let throttleTimer: ReturnType<typeof setTimeout> | undefined;
      let lastExtractAt = 0;
      let lastText = '';
      let lastChangeAt = Date.now();
      const startedAt = Date.now();

      const cleanup = () => {
        observer?.disconnect();
        if (pollTimer) clearInterval(pollTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        if (throttleTimer) clearTimeout(throttleTimer);
        ctx.signal.removeEventListener('abort', onAbort);
      };
      const finish = (error?: Error, value?: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(value ?? lastText);
      };
      const onAbort = () => finish(new AdapterError('CANCELLED', '任务已取消'));

      const extract = () => {
        const text = this.extractAnswer();
        if (text !== lastText) {
          lastText = text;
          lastChangeAt = Date.now();
          ctx.onProgress({ status: 'streaming', content: text });
        }
      };
      const scheduleExtract = () => {
        const elapsed = Date.now() - lastExtractAt;
        if (elapsed >= EXTRACT_THROTTLE_MS) {
          lastExtractAt = Date.now();
          extract();
          return;
        }
        if (throttleTimer) return;
        throttleTimer = setTimeout(() => {
          throttleTimer = undefined;
          lastExtractAt = Date.now();
          extract();
        }, EXTRACT_THROTTLE_MS - elapsed);
      };

      ctx.signal.addEventListener('abort', onAbort, { once: true });
      if (ctx.signal.aborted) {
        onAbort();
        return;
      }

      observer = new MutationObserver(() => scheduleExtract());
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      pollTimer = setInterval(() => {
        scheduleExtract();
        const now = Date.now();
        const stable = now - lastChangeAt >= STABLE_MS;
        const hasContent = lastText.trim().length > 0;
        const elapsedEnough = now - startedAt >= MIN_ANSWER_MS;

        if (this.isCompletedByRule() && hasContent) {
          finish(undefined, lastText);
          return;
        }
        if (hasContent && stable && elapsedEnough && !this.isGenerating()) {
          finish(undefined, lastText);
        }
      }, POLL_MS);

      timeoutTimer = setTimeout(() => {
        if (lastText.trim()) {
          finish(undefined, lastText);
        } else {
          finish(
            new AdapterError(
              'TIMEOUT',
              `回答超时（${Math.round(this.site.timeoutMs / 1000)}s），未能在页面上提取到回答内容。${this.describeFailure()}`,
            ),
          );
        }
      }, this.site.timeoutMs);
    });
  }
}
