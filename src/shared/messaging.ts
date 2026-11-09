/** UI <-> Service Worker / Content Script 的消息协议。P1 先打通链路自检。 */

export const MESSAGE_TYPES = {
  PING: 'omniask:ping',
  CONTENT_READY: 'omniask:content-ready',
  CONTENT_PROBE: 'omniask:content-probe',
} as const;

export interface PingMessage {
  type: typeof MESSAGE_TYPES.PING;
}

export interface PingResponse {
  ok: boolean;
  version: string;
  timestamp: number;
  source: 'service-worker';
}

export interface ContentReadyMessage {
  type: typeof MESSAGE_TYPES.CONTENT_READY;
  url: string;
}

export interface ContentProbeMessage {
  type: typeof MESSAGE_TYPES.CONTENT_PROBE;
}

export interface ContentProbeResponse {
  ok: boolean;
  url: string;
  title: string;
}

export type RuntimeMessage = PingMessage | ContentReadyMessage | ContentProbeMessage;

/** 校验后台服务是否存活，作为 P1 的可运行自检入口。 */
export async function pingServiceWorker(): Promise<PingResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('当前不是扩展运行环境，请先在 chrome://extensions 加载 dist 目录。');
  }
  const response = (await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.PING,
  } satisfies PingMessage)) as PingResponse | undefined;

  if (!response?.ok) {
    throw new Error('后台 Service Worker 未响应。');
  }
  return response;
}

/** 打开完整问答工作台；非扩展环境下退化为打开本地页面。 */
export function openWorkspace(): void {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const url = chrome.runtime.getURL('app.html');
    if (chrome.tabs?.create) {
      void chrome.tabs.create({ url });
      return;
    }
    globalThis.open(url, '_blank');
    return;
  }
  globalThis.open('/app.html', '_blank');
}
