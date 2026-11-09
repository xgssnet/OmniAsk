/** OmniAsk 核心数据结构。所有阶段共用，新增字段必须向后兼容本地历史数据。 */

export type SiteType = 'builtin' | 'web' | 'api';

/** CSS 选择器规则：均由用户配置驱动，内置站点的初始值需在 P4 实测验证。 */
export interface SelectorConfig {
  input: string;
  sendButton: string;
  response: string;
  responseContainer?: string;
  /** 元素存在即判定为已登录 */
  loggedIn?: string;
  /** 元素存在即判定为未登录 */
  loggedOut?: string;
  /** 元素存在即判定为仍在生成 */
  streamingIndicator?: string;
  /** 元素存在即判定为回答完成 */
  completionIndicator?: string;
}

export interface SiteConfig {
  id: string;
  name: string;
  url: string;
  type: SiteType;
  /** 站点缩写或 emoji，用于 UI 头像 */
  icon: string;
  iconUrl?: string;
  /** 主题色，用于卡片标识 */
  accent: string;
  enabled: boolean;
  participateInAnalysis: boolean;
  supportsStreaming: boolean;
  selectors: SelectorConfig;
  timeoutMs: number;
  /** true 表示用户自定义站点，删除/重置内置列表时不受影响 */
  custom: boolean;
}

export type TaskStatus =
  | 'pending'
  | 'checking-login'
  | 'submitting'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '等待中',
  'checking-login': '检查登录',
  submitting: '正在提问',
  streaming: '正在回答',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已取消',
};

export interface ModelResponse {
  siteId: string;
  status: TaskStatus;
  /** Markdown 原文 */
  content: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  attempts: number;
}

export type VerificationLevel =
  | 'verified'
  | 'well-supported'
  | 'inference'
  | 'disputed'
  | 'unverified';

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  verified: '已验证事实',
  'well-supported': '有较强依据的结论',
  inference: '合理推断',
  disputed: '存在争议',
  unverified: '尚无法验证',
};

export interface StructuredAnswer {
  siteId: string;
  conclusion: string;
  facts: string[];
  evidence: string[];
  data: string[];
  sources: string[];
  reasoning: string;
  uncertainties: string[];
  assumptions: string[];
}

export interface ConflictItem {
  topic: string;
  /** siteId -> 该模型的主张 */
  positions: Record<string, string>;
  resolution: string;
}

export interface FactCheckItem {
  claim: string;
  level: VerificationLevel;
  evidence: string;
  /** 只允许填写回答中真实出现或用户提供的来源，禁止编造 */
  sources: string[];
}

export interface AnalysisResult {
  questionId: string;
  createdAt: number;
  judgeModel: string;
  structured: StructuredAnswer[];
  consensus: string[];
  conflicts: ConflictItem[];
  factChecks: FactCheckItem[];
  finalAnswer: string;
  coreConclusions: string[];
  recommendation: string;
  uncertainties: string[];
  sources: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface HistoryRecord {
  id: string;
  question: string;
  createdAt: number;
  selectedSiteIds: string[];
  responses: ModelResponse[];
  analysis?: AnalysisResult;
  status: TaskStatus;
}

/** OpenAI Compatible 裁决模型配置，API Key 仅存本地。 */
export interface JudgeConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppSettings {
  theme: ThemeMode;
  defaultSiteIds: string[];
  maxConcurrency: number;
  autoAnalysis: boolean;
  onlineFactCheck: boolean;
  showDetailedAnalysis: boolean;
  saveRawResponses: boolean;
  judge: JudgeConfig;
  judgePrompt: string;
}
