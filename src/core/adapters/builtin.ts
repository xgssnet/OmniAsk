import { AdapterError, sleep } from './dom';
import { BaseAdapter, type AdapterContext } from './BaseAdapter';

/** 内置站点适配器。选择器来自配置，这里只描述各站点特有的提交与清理策略。 */
type SubmitStrategy = 'click-then-enter' | 'click-only' | 'enter-only';

abstract class BuiltinAdapter extends BaseAdapter {
  protected readonly strategy: SubmitStrategy = 'click-then-enter';
  protected readonly noise: RegExp[] = [/^\s*(Copy|复制|Regenerate|重新生成)\s*$/gm];

  protected override async submitQuestion(input: Element, ctx: AdapterContext): Promise<void> {
    if (this.strategy === 'enter-only') {
      this.pressEnter(input);
      await sleep(50, ctx.signal);
      return;
    }

    // 输入注入后按钮可能仍处于 disabled，等待其变为可用再点击，避免「看起来点了其实没发送」
    const button = await this.waitForUsableButton(this.selectors.sendButton, ctx.signal);
    if (button) {
      button.click();
      return;
    }
    if (this.strategy === 'click-only') {
      throw new AdapterError(
        'SEND_FAILED',
        `${this.site.name}：未找到可用的发送按钮，未使用 Enter 以避免在 contenteditable 中换行。请在「模型管理」校准发送按钮选择器。`,
      );
    }
    this.pressEnter(input);
    await sleep(50, ctx.signal);
  }

  protected override extractAnswer(): string {
    let text = super.extractAnswer();
    for (const pattern of this.noise) text = text.replace(pattern, '');
    return text.trim();
  }
}

/** 选择器均为多候选初始值，仍需以真实页面「测试选择器」结果为准。 */
export class ChatGPTAdapter extends BuiltinAdapter {
  protected override readonly strategy = 'click-then-enter';
}

export class ClaudeAdapter extends BuiltinAdapter {
  /** contenteditable 中 Enter 通常是换行，必须点击发送按钮。 */
  protected override readonly strategy = 'click-only';
}

export class GeminiAdapter extends BuiltinAdapter {
  protected override readonly strategy = 'click-then-enter';
}

export class DeepSeekAdapter extends BuiltinAdapter {
  protected override readonly strategy = 'enter-only';
}

export class DoubaoAdapter extends BuiltinAdapter {
  protected override readonly strategy = 'click-then-enter';
}

export class QwenAdapter extends BuiltinAdapter {
  protected override readonly strategy = 'click-then-enter';
}

export class YuanbaoAdapter extends BuiltinAdapter {
  protected override readonly strategy = 'click-then-enter';
}

export class KimiAdapter extends BuiltinAdapter {
  protected override readonly strategy = 'click-then-enter';
}

export class ChatglmAdapter extends BuiltinAdapter {
  protected override readonly strategy = 'click-then-enter';
}
