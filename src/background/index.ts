import { runAnalysis } from '@/core/judge/Judge';
import { testJudgeConnection } from '@/core/judge/connection';
import { normalizeSites, resolveNewChatUrl } from '@/core/sites/siteConfig';
import { putRecord } from '@/core/history/HistoryStore';
import { TaskQueue } from '@/core/queue/TaskQueue';
import {
  MESSAGE_TYPES,
  type ContentQueryResult,
  type ContentProbeMessage,
  type ExecuteTaskMessage,
  type RuntimeMessage,
  type TestSiteMessage,
  type TestSiteResponse,
} from '@/shared/messaging';
import { DEFAULT_SETTINGS, STORAGE_KEYS, normalizeSettings } from '@/shared/settings';
import { BUILTIN_SITES } from '@/shared/sites';
import { readStorage, writeStorage } from '@/shared/storage';
import {
  EMPTY_TASK,
  createTask,
  hasUsableAnswers,
  type ActiveTask,
} from '@/shared/task';
import type {
  AppSettings,
  HistoryRecord,
  ModelResponse,
  SiteConfig,
} from '@/shared/types';

/**
 * MV3 Service Worker：唯一的问答调度中枢。
 * 所有任务状态写入 chrome.storage.local，UI 可随时重连；SW 被终止后做明确降级。
 */
const pending = new Map<string, (response: ModelResponse) => void>();
let activeQueue: TaskQueue | null = null;

function pendingKey(taskId: string, siteId: string): string {
  return `${taskId}:${siteId}`;
}

async function getTask(): Promise<ActiveTask> {
  return readStorage<ActiveTask>(STORAGE_KEYS.activeTask, EMPTY_TASK);
}

/** 与 UI 保持同一套选择器，避免旧配置覆盖新候选。 */
async function getSites(): Promise<SiteConfig[]> {
  return normalizeSites(await readStorage<SiteConfig[]>(STORAGE_KEYS.sites, BUILTIN_SITES));
}

/** 补齐旧设置中缺失的新字段（例如 closeTabsAfterTask），避免后台读到 undefined。 */
async function getSettings(): Promise<AppSettings> {
  return normalizeSettings(
    await readStorage<AppSettings>(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
  );
}

async function saveTask(task: ActiveTask): Promise<void> {
  task.updatedAt = Date.now();
  await writeStorage(STORAGE_KEYS.activeTask, task);
  void Promise.resolve(
    chrome.runtime.sendMessage({ type: MESSAGE_TYPES.TASK_STATE_CHANGED, task }),
  ).catch(() => undefined);
}

async function updateResponse(taskId: string, response: ModelResponse): Promise<void> {
  const task = await getTask();
  if (task.id !== taskId) return;
  const index = task.responses.findIndex((item) => item.siteId === response.siteId);
  if (index >= 0) task.responses[index] = response;
  else task.responses.push(response);
  await saveTask(task);
}

/** 只记录本插件新建的标签页；用户原有页面绝不加入清理列表。 */
async function registerTab(taskId: string, tabId: number): Promise<void> {
  const task = await getTask();
  if (task.id !== taskId || task.tabIds.includes(tabId)) return;
  task.tabIds.push(tabId);
  await saveTask(task);
}

async function markFailure(taskId: string, siteId: string, message: string): Promise<void> {
  const task = await getTask();
  if (task.id !== taskId) return;
  const current = task.responses.find((item) => item.siteId === siteId);
  if (current && ['completed', 'failed', 'cancelled'].includes(current.status)) return;
  await updateResponse(taskId, {
    siteId,
    status: 'failed',
    content: current?.content ?? '',
    attempts: current?.attempts ?? 1,
    error: message,
    finishedAt: Date.now(),
  });
}

async function waitForTabLoaded(tabId: number): Promise<void> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('标签页加载超时，请检查网络或站点可访问性。');
}

interface TabTarget {
  tabId: number;
  /** 是否由本插件本次新建，决定任务结束后是否可被清理 */
  created: boolean;
}

/**
 * 优先复用浏览器中已打开的该站点页面；完全没有时才新建一个后台标签页。
 * 复用时由内容脚本在页面内执行「新建会话」动作，不再额外开 tab。
 */
async function resolveTab(site: SiteConfig): Promise<TabTarget> {
  const entryUrl = resolveNewChatUrl(site);
  let origin = '';
  try {
    origin = new URL(entryUrl).origin;
  } catch {
    throw new Error(`${site.name} 的新会话地址无效：${entryUrl}`);
  }

  const isUsable = (url: string) => !/\/login|\/signin|\/auth|\/passport/i.test(url);
  const tabs = await chrome.tabs.query({});
  const preferred = entryUrl.replace(/\/$/, '');
  const existing =
    tabs.find(
      (tab) => tab.id !== undefined && tab.url?.startsWith(preferred) && isUsable(tab.url),
    ) ??
    tabs.find((tab) => {
      if (tab.id === undefined || !tab.url || !isUsable(tab.url)) return false;
      try {
        return new URL(tab.url).origin === origin;
      } catch {
        return false;
      }
    });

  if (existing?.id !== undefined) return { tabId: existing.id, created: false };

  const tab = await chrome.tabs.create({ url: entryUrl, active: false });
  if (tab.id === undefined) throw new Error(`无法为 ${site.name} 创建标签页`);
  await waitForTabLoaded(tab.id);
  return { tabId: tab.id, created: true };
}

/** 内置站点由 manifest 静态注入；自定义站点在运行时按需注入，失败时给出明确错误。 */
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    const result = (await chrome.tabs.sendMessage(tabId, {
      type: MESSAGE_TYPES.CONTENT_PROBE,
    } satisfies ContentProbeMessage)) as ContentQueryResult;
    if (result?.ok && result.kind === 'probe') return;
  } catch {
    // 尚未注入，继续尝试
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await new Promise((resolve) => setTimeout(resolve, 250));
  } catch (error) {
    throw new Error(
      `无法注入内容脚本：${error instanceof Error ? error.message : String(error)}。请在「模型管理」中确认已授予该站点的访问权限。`,
    );
  }
}

async function runSite(
  taskId: string,
  site: SiteConfig,
  question: string,
  attempt: number,
  signal: AbortSignal,
): Promise<ModelResponse> {
  const { tabId, created } = await resolveTab(site);
  if (created) await registerTab(taskId, tabId);
  await ensureContentScript(tabId);

  const finished = new Promise<ModelResponse>((resolve, reject) => {
    const mapKey = pendingKey(taskId, site.id);
    const timer = setTimeout(() => {
      pending.delete(mapKey);
      reject(new Error(`${site.name} 任务超时，未收到内容脚本的完成通知。`));
    }, site.timeoutMs + 45_000);

    const onAbort = () => {
      clearTimeout(timer);
      pending.delete(mapKey);
      void Promise.resolve(
        chrome.tabs.sendMessage(tabId, {
          type: MESSAGE_TYPES.CANCEL_EXECUTION,
          taskId,
          siteId: site.id,
        }),
      ).catch(() => undefined);
      reject(new Error('任务已取消'));
    };

    pending.set(mapKey, (response) => {
      clearTimeout(timer);
      pending.delete(mapKey);
      signal.removeEventListener('abort', onAbort);
      resolve(response);
    });

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });

  await chrome.tabs.sendMessage(tabId, {
    type: MESSAGE_TYPES.EXECUTE_TASK,
    taskId,
    site,
    question,
    attempt,
  } satisfies ExecuteTaskMessage);

  return finished;
}

async function saveHistory(
  task: ActiveTask,
  settings: AppSettings,
  cancelled = false,
): Promise<void> {
  const record: HistoryRecord = {
    id: task.id,
    question: task.question,
    createdAt: task.createdAt,
    selectedSiteIds: task.siteIds,
    responses: settings.saveRawResponses
      ? task.responses
      : task.responses.map((response) => ({ ...response, content: '' })),
    analysis: task.analysis,
    status: cancelled ? 'cancelled' : 'completed',
  };
  await putRecord(record);
}

async function analyze(taskId: string): Promise<void> {
  const task = await getTask();
  if (task.id !== taskId) return;
  if (!hasUsableAnswers(task)) {
    task.error = '没有可用回答，跳过综合分析。';
    await saveTask(task);
    return;
  }

  // 回答完成后内容脚本心跳已停止；分析阶段需自行保活，避免 SW 在等待 API 时被终止
  const keepAlive = setInterval(() => {
    void chrome.storage.local.get(STORAGE_KEYS.activeTask);
  }, 8_000);

  task.phase = 'analyzing';
  task.error = undefined;
  task.analysisStage = '正在准备各模型回答与裁决配置…';
  await saveTask(task);

  try {
    const [settings, sites] = await Promise.all([getSettings(), getSites()]);
    const staged = await getTask();
    if (staged.id === taskId) {
      staged.analysisStage = `正在请求裁决模型 ${settings.judge.model || '(未配置)'}…`;
      await saveTask(staged);
    }

    const siteNames = Object.fromEntries(sites.map((site) => [site.id, site.name]));
    const analysis = await runAnalysis({
      taskId,
      question: task.question,
      responses: task.responses,
      siteNames,
      settings,
    });

    const latest = await getTask();
    if (latest.id !== taskId) return;
    latest.analysis = analysis;
    latest.phase = 'done';
    latest.error = undefined;
    latest.analysisStage = undefined;
    await saveTask(latest);
    await saveHistory(latest, settings).catch(() => undefined);
  } catch (error) {
    const latest = await getTask();
    if (latest.id !== taskId) return;
    latest.phase = 'done';
    latest.analysisStage = undefined;
    latest.error = `综合分析失败：${error instanceof Error ? error.message : String(error)}`;
    await saveTask(latest);
  } finally {
    clearInterval(keepAlive);
  }
}

/** 只关闭本次任务自己创建的后台标签页，绝不动用户原有页面。 */
async function closeTaskTabs(taskId: string, close: boolean): Promise<void> {
  if (!close) return;
  const latest = await getTask();
  if (latest.id !== taskId || latest.tabIds.length === 0) return;
  for (const tabId of latest.tabIds) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // 用户可能已手动关闭该标签页
    }
  }
  latest.tabIds = [];
  await saveTask(latest);
}

async function finalize(taskId: string): Promise<void> {
  const task = await getTask();
  if (task.id !== taskId) return;
  const wasCancelled = task.phase === 'cancelled';
  task.phase = 'done';
  await saveTask(task);

  const settings = await getSettings();
  await saveHistory(task, settings, wasCancelled).catch((error: unknown) => {
    console.warn('[omniask] 保存历史失败：', error);
  });
  await closeTaskTabs(taskId, settings.closeTabsAfterTask);

  if (!wasCancelled && settings.autoAnalysis && hasUsableAnswers(task)) {
    await analyze(taskId);
  }
}

async function startTask(question: string, siteIds: string[]): Promise<void> {
  await recovery;
  const [settings, sites] = await Promise.all([
    getSettings(),
    getSites(),
  ]);
  const selected = sites.filter((site) => siteIds.includes(site.id) && site.enabled);
  if (selected.length === 0) {
    const task = await getTask();
    task.error = '没有已启用且被选中的模型，请先在「模型管理」中启用站点。';
    await saveTask(task);
    return;
  }

  const task = createTask(question, selected.map((site) => site.id));
  await saveTask(task);

  const queue = new TaskQueue(Math.max(1, settings.maxConcurrency));
  activeQueue = queue;
  try {
    await queue.runAll(
      selected.map((site) => ({
        id: site.id,
        timeoutMs: site.timeoutMs + 50_000,
        retries: 0,
        run: (signal: AbortSignal) => runSite(task.id, site, question, 1, signal),
      })),
      (result) => {
        if (result.error && !result.cancelled) {
          void markFailure(task.id, result.id, result.error.message);
        }
      },
    );
  } finally {
    activeQueue = null;
  }
  await finalize(task.id);
}

async function cancelTask(): Promise<void> {
  activeQueue?.cancelAll();
  const task = await getTask();
  if (!task.id) return;
  task.phase = 'cancelled';
  task.responses = task.responses.map((response) =>
    ['pending', 'checking-login', 'submitting', 'streaming'].includes(response.status)
      ? { ...response, status: 'cancelled' as const, error: '任务已取消' }
      : response,
  );
  await saveTask(task);
}

async function retrySite(siteId: string): Promise<void> {
  const task = await getTask();
  if (!task.id || !task.siteIds.includes(siteId)) return;
  const sites = await getSites();
  const site = sites.find((item) => item.id === siteId);
  if (!site) return;

  const previous = task.responses.find((response) => response.siteId === siteId);
  const attempt = (previous?.attempts ?? 0) + 1;
  task.phase = 'running';
  await saveTask(task);
  await updateResponse(task.id, {
    siteId,
    status: 'pending',
    content: '',
    attempts: attempt,
    startedAt: Date.now(),
  });

  const queue = new TaskQueue(1);
  const results = await queue.runAll([
    {
      id: siteId,
      timeoutMs: site.timeoutMs + 50_000,
      retries: 0,
      run: (signal: AbortSignal) => runSite(task.id, site, task.question, attempt, signal),
    },
  ]);
  if (results[0]?.error && !results[0].cancelled) {
    await markFailure(task.id, siteId, results[0].error.message);
  }
  await finalize(task.id);
}

async function handleTestSite(message: TestSiteMessage): Promise<TestSiteResponse> {
  const { site, kind } = message;
  try {
    const { tabId } = await resolveTab(site);
    await ensureContentScript(tabId);
    const query =
      kind === 'login'
        ? { type: MESSAGE_TYPES.CHECK_LOGIN, site }
        : kind === 'selectors'
          ? { type: MESSAGE_TYPES.TEST_SELECTORS, site }
          : ({ type: MESSAGE_TYPES.CONTENT_PROBE } satisfies ContentProbeMessage);
    const result = (await chrome.tabs.sendMessage(tabId, query)) as ContentQueryResult;
    if (!result.ok) return { ok: false, detail: result.error };

    if (result.kind === 'probe') {
      return { ok: true, detail: `内容脚本已注入：${result.data.title || result.data.url}` };
    }
    if (result.kind === 'login') {
      return {
        ok: true,
        login: result.data,
        detail: result.data.reliable
          ? `登录状态：${result.data.loggedIn ? '已登录' : '未登录'}（${result.data.detail}）`
          : `无法可靠判断（${result.data.detail}）`,
      };
    }
    const required = result.data.filter((check) => check.required !== false);
    const passed = required.filter((check) => check.found).length;
    return {
      ok: passed === required.length,
      checks: result.data,
      detail: `必需项识别 ${passed}/${required.length}；未识别项可在下方编辑选择器后重新测试。通用候选仅供参考。`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** SW 可能被浏览器随时终止：把残留的运行中任务明确标记，而不是假装已完成。 */
const recovery = (async () => {
  const task = await getTask();

  // 分析被中断时各模型回答仍然完好：自动补跑一次，而不是让用户重新提问
  if (task.phase === 'analyzing') {
    const retries = task.analysisRetries ?? 0;
    if (retries < 1 && hasUsableAnswers(task)) {
      task.analysisRetries = retries + 1;
      task.error = undefined;
      task.analysisStage = '后台服务曾在综合分析期间被终止，正在自动重试…';
      await saveTask(task);
      await analyze(task.id);
      return;
    }
    task.phase = 'done';
    task.analysisStage = undefined;
    task.error =
      '综合分析被后台服务中断且自动重试未完成。各模型回答已保留，请点击「重新分析」，无需重新提问。';
    await saveTask(task);
    return;
  }

  if (task.phase !== 'running') return;
  task.phase = 'done';
  task.error = '后台服务曾被浏览器终止，任务未完成。请重新提问。';
  task.responses = task.responses.map((response) =>
    ['pending', 'checking-login', 'submitting', 'streaming'].includes(response.status)
      ? { ...response, status: 'cancelled' as const, error: '后台服务中断' }
      : response,
  );
  await saveTask(task);
})();

chrome.runtime.onInstalled.addListener(() => {
  const sidePanel = chrome.sidePanel;
  if (!sidePanel?.setPanelBehavior) return;
  void Promise.resolve(
    sidePanel.setPanelBehavior({ openPanelOnActionClick: false }),
  ).catch(() => undefined);
});

chrome.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse: (value: unknown) => void) => {
    switch (message?.type) {
      case MESSAGE_TYPES.PING:
        sendResponse({
          ok: true,
          version: chrome.runtime.getManifest().version,
          timestamp: Date.now(),
          source: 'service-worker',
        });
        return false;

      case MESSAGE_TYPES.CONTENT_READY:
      case MESSAGE_TYPES.TASK_HEARTBEAT:
        sendResponse({ ok: true });
        return false;

      case MESSAGE_TYPES.TASK_PROGRESS:
        if (message.type === MESSAGE_TYPES.TASK_PROGRESS) {
          void updateResponse(message.taskId, message.response);
        }
        return false;

      case MESSAGE_TYPES.TASK_FINISHED:
        if (message.type === MESSAGE_TYPES.TASK_FINISHED) {
          void updateResponse(message.taskId, message.response);
          const mapKey = pendingKey(message.taskId, message.response.siteId);
          pending.get(mapKey)?.(message.response);
          pending.delete(mapKey);
        }
        return false;

      case MESSAGE_TYPES.START_TASK:
        if (message.type === MESSAGE_TYPES.START_TASK) {
          void startTask(message.question, message.siteIds).catch((error: unknown) => {
            console.error('[omniask] 任务调度失败：', error);
          });
        }
        sendResponse({ accepted: true });
        return false;

      case MESSAGE_TYPES.CANCEL_TASK:
        void cancelTask();
        sendResponse({ accepted: true });
        return false;

      case MESSAGE_TYPES.RETRY_SITE:
        if (message.type === MESSAGE_TYPES.RETRY_SITE) {
          void retrySite(message.siteId).catch((error: unknown) => {
            console.error('[omniask] 重试失败：', error);
          });
        }
        sendResponse({ accepted: true });
        return false;

      case MESSAGE_TYPES.ANALYZE_TASK:
        void (async () => {
          const task = await getTask();
          if (task.id) await analyze(task.id);
        })();
        sendResponse({ accepted: true });
        return false;

      case MESSAGE_TYPES.CLEAR_TASK:
        void saveTask({ ...EMPTY_TASK });
        sendResponse({ accepted: true });
        return false;

      case MESSAGE_TYPES.TEST_SITE:
        if (message.type === MESSAGE_TYPES.TEST_SITE) {
          void handleTestSite(message)
            .then(sendResponse)
            .catch((error: unknown) =>
              sendResponse({
                ok: false,
                detail: error instanceof Error ? error.message : String(error),
              }),
            );
        }
        return true;

      case MESSAGE_TYPES.TEST_JUDGE:
        if (message.type === MESSAGE_TYPES.TEST_JUDGE) {
          const config = message.config;
          if (!config) {
            sendResponse({ ok: false, detail: '测试请求缺少 API 配置。', latencyMs: 0 });
            return true;
          }
          // 用 Promise 链保证任何异常都会回响应，避免前台永久等待
          void Promise.resolve()
            .then(() => testJudgeConnection(config))
            .then(sendResponse)
            .catch((error: unknown) =>
              sendResponse({
                ok: false,
                detail: error instanceof Error ? error.message : String(error),
                latencyMs: 0,
              }),
            );
        }
        return true;

      default:
        return false;
    }
  },
);
