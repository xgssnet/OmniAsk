import type { AnalysisResult, ModelResponse } from './types';

/** 当前问答任务的持久化状态。Service Worker 随时可能被终止，因此状态必须可落盘恢复。 */
export type TaskPhase = 'idle' | 'running' | 'analyzing' | 'done' | 'cancelled';

export interface ActiveTask {
  id: string;
  question: string;
  createdAt: number;
  updatedAt: number;
  siteIds: string[];
  responses: ModelResponse[];
  phase: TaskPhase;
  analysis?: AnalysisResult;
  error?: string;
  /** 综合分析当前阶段说明，便于界面显示进度 */
  analysisStage?: string;
  /** SW 重启后自动补跑综合分析的次数，避免无限重试 */
  analysisRetries?: number;
  /** 已打开的标签页，供取消与复用 */
  tabIds: number[];
}

export const EMPTY_TASK: ActiveTask = {
  id: '',
  question: '',
  createdAt: 0,
  updatedAt: 0,
  siteIds: [],
  responses: [],
  phase: 'idle',
  tabIds: [],
};

export function createTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTask(question: string, siteIds: string[]): ActiveTask {
  const now = Date.now();
  return {
    id: createTaskId(),
    question,
    createdAt: now,
    updatedAt: now,
    siteIds,
    responses: siteIds.map((siteId) => ({
      siteId,
      status: 'pending',
      content: '',
      attempts: 0,
    })),
    phase: 'running',
    tabIds: [],
  };
}

export function responseOf(task: ActiveTask, siteId: string): ModelResponse | undefined {
  return task.responses.find((response) => response.siteId === siteId);
}

/** 所有站点都已结束（成功或失败）时，可进入综合分析。 */
export function allSettled(task: ActiveTask): boolean {
  return (
    task.responses.length > 0 &&
    task.responses.every((response) =>
      ['completed', 'failed', 'cancelled'].includes(response.status),
    )
  );
}

export function hasUsableAnswers(task: ActiveTask): boolean {
  return task.responses.some(
    (response) => response.status === 'completed' && response.content.trim().length > 0,
  );
}

export type AnalysisViewState =
  | 'done'
  | 'analyzing'
  | 'failed'
  | 'not-configured'
  | 'no-answers'
  | 'idle';

/** 界面据此展示综合答案区的状态，避免把所有失败都显示成「暂无综合答案」。 */
export function analysisViewState(task: ActiveTask, hasApiKey: boolean): AnalysisViewState {
  if (task.analysis) return 'done';
  if (task.phase === 'analyzing') return 'analyzing';
  if (task.error) return 'failed';
  if (!hasApiKey) return 'not-configured';
  if (!hasUsableAnswers(task)) return 'no-answers';
  return 'idle';
}
