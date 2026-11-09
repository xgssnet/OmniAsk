/** UI ↔ Service Worker ↔ Content Script 的消息协议。 */
import type { ActiveTask } from './task';
import type { JudgeConfig, ModelResponse, SiteConfig } from './types';
import type { LoginCheck, SelectorCheck } from '@/core/adapters/BaseAdapter';
import type { JudgeConnectionResult } from '@/core/judge/connection';

export const MESSAGE_TYPES = {
  PING: 'omniask:ping',
  CONTENT_READY: 'omniask:content-ready',
  CONTENT_PROBE: 'omniask:content-probe',

  // Service Worker → Content Script
  EXECUTE_TASK: 'omniask:execute-task',
  CANCEL_EXECUTION: 'omniask:cancel-execution',
  CHECK_LOGIN: 'omniask:check-login',
  TEST_SELECTORS: 'omniask:test-selectors',

  // Content Script → Service Worker
  TASK_PROGRESS: 'omniask:task-progress',
  TASK_FINISHED: 'omniask:task-finished',
  /** 内容脚本定时心跳，避免长时间等待回答时 Service Worker 被浏览器终止 */
  TASK_HEARTBEAT: 'omniask:task-heartbeat',

  // UI → Service Worker
  START_TASK: 'omniask:start-task',
  CANCEL_TASK: 'omniask:cancel-task',
  RETRY_SITE: 'omniask:retry-site',
  ANALYZE_TASK: 'omniask:analyze-task',
  CLEAR_TASK: 'omniask:clear-task',
  TEST_SITE: 'omniask:test-site',
  TEST_JUDGE: 'omniask:test-judge',

  // Service Worker → UI
  TASK_STATE_CHANGED: 'omniask:task-state-changed',
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

export interface ExecuteTaskMessage {
  type: typeof MESSAGE_TYPES.EXECUTE_TASK;
  taskId: string;
  site: SiteConfig;
  question: string;
  attempt: number;
}
export interface CancelExecutionMessage {
  type: typeof MESSAGE_TYPES.CANCEL_EXECUTION;
  taskId: string;
  siteId: string;
}
export interface CheckLoginMessage {
  type: typeof MESSAGE_TYPES.CHECK_LOGIN;
  site: SiteConfig;
}
export interface TestSelectorsMessage {
  type: typeof MESSAGE_TYPES.TEST_SELECTORS;
  site: SiteConfig;
}
export type ContentQueryResult =
  | { ok: true; kind: 'probe'; data: ContentProbeResponse }
  | { ok: true; kind: 'login'; data: LoginCheck }
  | { ok: true; kind: 'selectors'; data: SelectorCheck[] }
  | { ok: false; error: string };

export interface TaskProgressMessage {
  type: typeof MESSAGE_TYPES.TASK_PROGRESS;
  taskId: string;
  response: ModelResponse;
}
export interface TaskFinishedMessage {
  type: typeof MESSAGE_TYPES.TASK_FINISHED;
  taskId: string;
  response: ModelResponse;
}
export interface TaskHeartbeatMessage {
  type: typeof MESSAGE_TYPES.TASK_HEARTBEAT;
  taskId: string;
  siteId: string;
}

export interface StartTaskMessage {
  type: typeof MESSAGE_TYPES.START_TASK;
  question: string;
  siteIds: string[];
}
export interface CancelTaskMessage {
  type: typeof MESSAGE_TYPES.CANCEL_TASK;
}
export interface RetrySiteMessage {
  type: typeof MESSAGE_TYPES.RETRY_SITE;
  siteId: string;
}
export interface AnalyzeTaskMessage {
  type: typeof MESSAGE_TYPES.ANALYZE_TASK;
}
export interface ClearTaskMessage {
  type: typeof MESSAGE_TYPES.CLEAR_TASK;
}
export type TestKind = 'connection' | 'login' | 'selectors';
export interface TestSiteMessage {
  type: typeof MESSAGE_TYPES.TEST_SITE;
  site: SiteConfig;
  kind: TestKind;
}
export interface TestSiteResponse {
  ok: boolean;
  detail: string;
  checks?: SelectorCheck[];
  login?: LoginCheck;
}
export interface TestJudgeMessage {
  type: typeof MESSAGE_TYPES.TEST_JUDGE;
  config: JudgeConfig;
}
export type TestJudgeResponse = JudgeConnectionResult;
export interface TaskStateChangedMessage {
  type: typeof MESSAGE_TYPES.TASK_STATE_CHANGED;
  task: ActiveTask;
}

export type RuntimeMessage =
  | PingMessage
  | ContentReadyMessage
  | ContentProbeMessage
  | ExecuteTaskMessage
  | CancelExecutionMessage
  | CheckLoginMessage
  | TestSelectorsMessage
  | TaskProgressMessage
  | TaskFinishedMessage
  | TaskHeartbeatMessage
  | StartTaskMessage
  | CancelTaskMessage
  | RetrySiteMessage
  | AnalyzeTaskMessage
  | ClearTaskMessage
  | TestSiteMessage
  | TestJudgeMessage
  | TaskStateChangedMessage;

export function sendToBackground<T = unknown>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

export async function pingServiceWorker(): Promise<PingResponse> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('当前不是扩展运行环境，请先在 chrome://extensions 加载 dist 目录。');
  }
  const response = (await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.PING,
  } satisfies PingMessage)) as PingResponse | undefined;
  if (!response?.ok) throw new Error('后台 Service Worker 未响应。');
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
