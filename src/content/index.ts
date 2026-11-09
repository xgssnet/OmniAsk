import { createAdapter } from '@/core/adapters/AdapterManager';
import { AdapterError } from '@/core/adapters/dom';
import {
  MESSAGE_TYPES,
  type CancelExecutionMessage,
  type ContentQueryResult,
  type ContentReadyMessage,
  type ExecuteTaskMessage,
  type RuntimeMessage,
} from '@/shared/messaging';
import type { ModelResponse } from '@/shared/types';

/**
 * Content Script（单文件 IIFE）。
 * 只负责执行适配器与 DOM 操作，不含任务调度、历史或裁决逻辑。
 */
const controllers = new Map<string, AbortController>();

function report(message: RuntimeMessage): void {
  void Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => undefined);
}

function executionKey(taskId: string, siteId: string): string {
  return `${taskId}:${siteId}`;
}

async function execute(message: ExecuteTaskMessage): Promise<void> {
  const key = executionKey(message.taskId, message.site.id);
  controllers.get(key)?.abort();
  const controller = new AbortController();
  controllers.set(key, controller);

  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    report({
      type: MESSAGE_TYPES.TASK_HEARTBEAT,
      taskId: message.taskId,
      siteId: message.site.id,
    });
  }, 10_000);
  const response: ModelResponse = {
    siteId: message.site.id,
    status: 'submitting',
    content: '',
    attempts: message.attempt,
    startedAt,
  };

  const onProgress = (patch: Partial<ModelResponse>) => {
    Object.assign(response, patch);
    report({
      type: MESSAGE_TYPES.TASK_PROGRESS,
      taskId: message.taskId,
      response: { ...response },
    });
  };

  try {
    const adapter = createAdapter(message.site);
    const result = await adapter.run({
      taskId: message.taskId,
      question: message.question,
      signal: controller.signal,
      onProgress,
    });
    report({
      type: MESSAGE_TYPES.TASK_FINISHED,
      taskId: message.taskId,
      response: {
        ...response,
        status: 'completed',
        content: result.content,
        durationMs: result.durationMs,
        finishedAt: Date.now(),
      },
    });
  } catch (error) {
    const adapterError = error as Error;
    const cancelled = adapterError instanceof AdapterError && adapterError.code === 'CANCELLED';
    report({
      type: MESSAGE_TYPES.TASK_FINISHED,
      taskId: message.taskId,
      response: {
        ...response,
        status: cancelled ? 'cancelled' : 'failed',
        error: adapterError.message || '未知错误',
        durationMs: Date.now() - startedAt,
        finishedAt: Date.now(),
      },
    });
  } finally {
    clearInterval(heartbeat);
    controllers.delete(key);
  }
}

async function handleQuery(message: RuntimeMessage): Promise<ContentQueryResult> {
  if (message.type === MESSAGE_TYPES.CONTENT_PROBE) {
    return {
      ok: true,
      kind: 'probe',
      data: { ok: true, url: location.href, title: document.title },
    };
  }
  if (message.type === MESSAGE_TYPES.CHECK_LOGIN) {
    const adapter = createAdapter(message.site);
    return { ok: true, kind: 'login', data: await adapter.checkLogin() };
  }
  if (message.type === MESSAGE_TYPES.TEST_SELECTORS) {
    const adapter = createAdapter(message.site);
    return { ok: true, kind: 'selectors', data: await adapter.testSelectors() };
  }
  return { ok: false, error: `不支持的指令：${(message as { type: string }).type}` };
}

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse: (value: unknown) => void) => {
    if (message?.type === MESSAGE_TYPES.EXECUTE_TASK) {
      void execute(message as ExecuteTaskMessage);
      sendResponse({ accepted: true });
      return false;
    }
    if (message?.type === MESSAGE_TYPES.CANCEL_EXECUTION) {
      const cancel = message as CancelExecutionMessage;
      controllers.get(executionKey(cancel.taskId, cancel.siteId))?.abort();
      sendResponse({ accepted: true });
      return false;
    }

    void handleQuery(message)
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true;
  },
);

void Promise.resolve(
  chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.CONTENT_READY,
    url: location.href,
  } satisfies ContentReadyMessage),
).catch(() => undefined);
