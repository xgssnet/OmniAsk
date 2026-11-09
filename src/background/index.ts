import {
  MESSAGE_TYPES,
  type ContentReadyMessage,
  type PingResponse,
  type RuntimeMessage,
} from '../shared/messaging';

/**
 * MV3 Service Worker。P1 只负责运行时链路自检与侧边栏行为设置；
 * P5 的任务队列将在此注册，并把任务状态写回 chrome.storage 以支持 SW 重启后恢复。
 */
chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse) => {
    if (message?.type === MESSAGE_TYPES.PING) {
      const response: PingResponse = {
        ok: true,
        version: chrome.runtime.getManifest().version,
        timestamp: Date.now(),
        source: 'service-worker',
      };
      sendResponse(response);
    }

    if (message?.type === MESSAGE_TYPES.CONTENT_READY) {
      const ready = message as ContentReadyMessage;
      console.debug('[omniask] content script ready:', ready.url);
      sendResponse({ ok: true });
    }

    return false;
  },
);

chrome.runtime.onInstalled.addListener(() => {
  const sidePanel = chrome.sidePanel;
  if (!sidePanel?.setPanelBehavior) return;
  void Promise.resolve(
    sidePanel.setPanelBehavior({ openPanelOnActionClick: false }),
  ).catch(() => undefined);
});
