import { useCallback, useEffect, useState } from 'react';
import { MESSAGE_TYPES, sendToBackground } from '@/shared/messaging';
import { STORAGE_KEYS } from '@/shared/settings';
import { readStorage } from '@/shared/storage';
import { EMPTY_TASK, type ActiveTask } from '@/shared/task';

/** UI 侧订阅任务状态：storage.onChanged 保证关闭页面后重连也能恢复进度。 */
export function useTask() {
  const [task, setTask] = useState<ActiveTask>(EMPTY_TASK);

  useEffect(() => {
    let alive = true;
    void readStorage<ActiveTask>(STORAGE_KEYS.activeTask, EMPTY_TASK).then((stored) => {
      if (alive) setTask(stored);
    });

    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local') return;
      const change = changes[STORAGE_KEYS.activeTask];
      if (change?.newValue) setTask(change.newValue as ActiveTask);
    };
    const onMessage = (message: unknown) => {
      const candidate = message as { type?: string; task?: ActiveTask };
      if (candidate?.type === MESSAGE_TYPES.TASK_STATE_CHANGED && candidate.task) {
        setTask(candidate.task);
      }
    };

    try {
      chrome.storage?.onChanged?.addListener(onStorageChanged);
      chrome.runtime?.onMessage?.addListener(onMessage);
    } catch {
      // 普通网页调试环境没有 chrome API
    }
    return () => {
      alive = false;
      try {
        chrome.storage?.onChanged?.removeListener(onStorageChanged);
        chrome.runtime?.onMessage?.removeListener(onMessage);
      } catch {
        // noop
      }
    };
  }, []);

  const start = useCallback(async (question: string, siteIds: string[]) => {
    await sendToBackground({ type: MESSAGE_TYPES.START_TASK, question, siteIds });
  }, []);

  const cancel = useCallback(async () => {
    await sendToBackground({ type: MESSAGE_TYPES.CANCEL_TASK });
  }, []);

  const retry = useCallback(async (siteId: string) => {
    await sendToBackground({ type: MESSAGE_TYPES.RETRY_SITE, siteId });
  }, []);

  const analyze = useCallback(async () => {
    await sendToBackground({ type: MESSAGE_TYPES.ANALYZE_TASK });
  }, []);

  const clear = useCallback(async () => {
    await sendToBackground({ type: MESSAGE_TYPES.CLEAR_TASK });
  }, []);

  return { task, start, cancel, retry, analyze, clear };
}
