import { BaseAdapter } from './BaseAdapter';

/**
 * 自定义网站适配器：完全由用户在设置页配置的 CSS 选择器驱动。
 * 不做任何站点内置的假设；找不到元素时由 BaseAdapter 抛出明确错误。
 */
export class CustomAdapter extends BaseAdapter {
  protected override isGenerating(): boolean {
    if (!this.site.supportsStreaming) return false;
    return super.isGenerating();
  }
}
