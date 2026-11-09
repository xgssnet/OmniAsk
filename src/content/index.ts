import {
  MESSAGE_TYPES,
  type ContentProbeResponse,
  type ContentReadyMessage,
  type RuntimeMessage,
} from '../shared/messaging';

/**
 * Content Script（单文件 IIFE，MV3 不支持 ESM import）。
 * P1 只上报注入状态并响应探针，不改动目标网站 DOM；
 * P3/P4 的适配器将在这里按站点配置执行输入、发送与回答提取。
 */
void Promise.resolve(
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.CONTENT_READY,
    url: location.href,
  } satisfies ContentReadyMessage),
).catch(() => undefined);

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    if (message?.type === MESSAGE_TYPES.CONTENT_PROBE) {
      const response: ContentProbeResponse = {
        ok: true,
        url: location.href,
        title: document.title,
      };
      sendResponse(response);
    }
    return false;
  },
);
