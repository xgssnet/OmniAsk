import { siteOriginPattern } from '@/core/sites/siteConfig';

/** MV3 扩展页跨域 fetch 需要运行时主机权限；此函数在用户手势下调用。 */
export async function requestJudgeOrigin(baseUrl: string): Promise<boolean> {
  const origin = siteOriginPattern(baseUrl);
  if (!origin) return false;
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return true;
  try {
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

/** 调用前校验，未授权时给出明确的修复指引而不是静默失败。 */
export async function ensureJudgeOrigin(baseUrl: string): Promise<void> {
  const origin = siteOriginPattern(baseUrl);
  if (!origin) throw new Error('API Base URL 格式不正确。');
  if (typeof chrome === 'undefined' || !chrome.permissions?.contains) return;
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (!granted) {
    throw new Error(
      `尚未授权访问 ${origin}。请在「设置 → 综合分析配置」中重新保存 Base URL 并允许权限请求。`,
    );
  }
}
