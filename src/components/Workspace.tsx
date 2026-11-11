import { useState, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { LazyMarkdownView } from '@/components/LazyMarkdownView';
import { ModelSelector } from '@/components/ModelSelector';
import { ResponseCard } from '@/components/ResponseCard';
import { useAppState } from '@/state/AppStateProvider';
import { useTask } from '@/state/useTask';
import { cn, copyToClipboard } from '@/lib/utils';
import { openSettings, openWorkspace } from '@/shared/messaging';
import { analysisViewState } from '@/shared/task';
import { PREVIEW_ANALYSIS, PREVIEW_QUESTION, PREVIEW_RESPONSES, PREVIEW_SITE_IDS } from '@/shared/preview';
import { VERIFICATION_LABELS, type ModelResponse, type SiteConfig } from '@/shared/types';

interface Notice {
  kind: 'ok' | 'error' | 'info';
  text: string;
}

function fallbackSite(id: string): SiteConfig {
  return {
    id,
    name: id,
    url: '',
    type: 'web',
    icon: '?',
    accent: '#64748b',
    enabled: true,
    participateInAnalysis: true,
    supportsStreaming: false,
    selectors: { input: '', sendButton: '', response: '' },
    timeoutMs: 0,
    custom: true,
  };
}

export function Workspace({ compact = false }: { compact?: boolean }) {
  const {
    ready,
    sites,
    settings: appSettings,
    draft,
    setQuestion,
    setSelectedSiteIds,
    toggleSiteSelection,
    saveDefaultSelection,
    resetDraft,
  } = useAppState();
  const { task, start, cancel, retry, analyze, clear } = useTask();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [preview, setPreview] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [copiedFinal, setCopiedFinal] = useState(false);

  const enabledSites = sites.filter((site) => site.enabled);
  const selectedSites = enabledSites.filter((site) => draft.selectedSiteIds.includes(site.id));
  const siteFor = (id: string): SiteConfig => sites.find((site) => site.id === id) ?? fallbackSite(id);

  const live = !preview && task.id !== '';
  const displaySites: SiteConfig[] = preview
    ? sites.filter((site) => PREVIEW_SITE_IDS.includes(site.id))
    : live
      ? task.siteIds.map(siteFor)
      : [];
  const responses: ModelResponse[] = preview
    ? PREVIEW_RESPONSES
    : live
      ? task.responses
      : [];
  const responseBySite = new Map(responses.map((response) => [response.siteId, response]));
  const running = task.phase === 'running' || task.phase === 'analyzing';

  const togglePreview = () => {
    const next = !preview;
    setPreview(next);
    setNotice(null);
    setExpandedIds(next ? [...PREVIEW_SITE_IDS] : []);
  };

  const toggleExpanded = (id: string) =>
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const submit = async () => {
    const value = draft.question.trim();
    if (!value) {
      setNotice({ kind: 'error', text: '请先输入问题。' });
      return;
    }
    if (selectedSites.length === 0) {
      setNotice({ kind: 'error', text: '请至少选择一个已启用的 AI 模型。' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await start(value, selectedSites.map((site) => site.id));
      setNotice({
        kind: 'ok',
        text: '任务已提交：后台会打开对应站点标签页并并行提问。进度实时显示，关闭页面后重新打开也会恢复。',
      });
      setExpandedIds(selectedSites.map((site) => site.id));
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : '无法启动任务，请确认已加载扩展。',
      });
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const onRetry = async (siteId: string) => {
    try {
      await retry(siteId);
      setNotice({ kind: 'ok', text: `已重新向「${siteFor(siteId).name}」提问。` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '重试失败。' });
    }
  };

  const finalMarkdown = preview ? PREVIEW_ANALYSIS : (task.analysis?.finalAnswer ?? '');
  const analysisState = analysisViewState(task, Boolean(appSettings.judge.apiKey.trim()));
  const analysisHint =
    analysisState === 'failed'
      ? (task.error ?? '综合分析失败，原因未记录。')
      : analysisState === 'not-configured'
        ? '尚未配置裁决模型的 API Key。请到「设置 → 综合分析设置」填写 API Base URL / API Key / Model，并点击「测试连接」确认可用。'
        : analysisState === 'no-answers'
          ? '本次没有可用的模型回答，无法进行综合分析。请先确认各模型回答是否成功。'
          : '本次未生成综合答案。可能是关闭了「自动开始综合分析」，或后台服务在汇总阶段被重启。各模型回答已保留，可直接重试分析，无需重新提问。';
  const copyFinal = async () => {
    if (!(await copyToClipboard(finalMarkdown))) return;
    setCopiedFinal(true);
    setTimeout(() => setCopiedFinal(false), 1500);
  };

  return (
    <div className={cn('mx-auto w-full max-w-3xl space-y-4', compact ? 'p-3' : 'p-4 md:p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold">向多个模型提问</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            一次输入，并行获取多个回答，交叉验证后生成最佳答案。
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {live && (
            <Badge variant={running ? 'default' : 'secondary'}>
              {task.phase === 'analyzing' ? '综合分析中' : running ? '提问中' : '任务结束'}
            </Badge>
          )}
          <Button variant={preview ? 'secondary' : 'outline'} size="sm" onClick={togglePreview}>
            <Eye className="h-3.5 w-3.5" />
            {preview ? '退出预览' : '界面预览'}
          </Button>
        </div>
      </div>

      {preview && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-[11px] leading-5">
          <Badge variant="warning" className="mt-0.5 shrink-0">界面预览</Badge>
          <span>
            下方回答与综合答案均为示例数据，仅用于验证界面渲染，<strong>不是真实 AI 输出</strong>，不会写入历史记录。
          </span>
        </div>
      )}

      {live && task.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs leading-5 text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{task.error}</span>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs text-muted-foreground">你的问题</CardTitle>
          <span className="text-[10px] text-muted-foreground">
            {ready ? '草稿自动保存到本地' : '正在读取本地配置…'}
          </span>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={preview ? PREVIEW_QUESTION : live ? task.question : draft.question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            readOnly={preview || live}
            placeholder="例如：Rocky Linux 9 如何部署 Docker，并配置国内镜像源？"
            className={cn('leading-6', compact ? 'min-h-[76px]' : 'min-h-[110px]', live && 'opacity-80')}
            aria-label="问题内容"
          />
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span>Enter / Ctrl+Enter 提交 · Shift+Enter 换行</span>
            <span>{(preview ? PREVIEW_QUESTION : live ? task.question : draft.question).length} 字</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-xs text-muted-foreground">选择 AI 模型</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            已选 {selectedSites.length} / 可用 {enabledSites.length}
          </span>
        </CardHeader>
        <CardContent>
          <ModelSelector
            sites={sites}
            selectedIds={draft.selectedSiteIds}
            onToggle={toggleSiteSelection}
            onSelectAll={setSelectedSiteIds}
            onClear={() => setSelectedSiteIds([])}
            onSaveDefault={() => {
              saveDefaultSelection();
              setNotice({ kind: 'ok', text: '已把当前模型组合保存为默认组合。' });
            }}
            compact={compact}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void submit()} disabled={busy || running}>
          {busy || running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          开始提问
        </Button>
        <Button variant="outline" disabled={!running} onClick={() => void cancel()}>
          <Square className="h-4 w-4" />
          停止任务
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            resetDraft();
            setNotice({ kind: 'info', text: '草稿已清空，模型组合恢复为默认设置。' });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空草稿
        </Button>
        {live && (
          <Button variant="ghost" size="sm" onClick={() => void clear()}>
            清空任务视图
          </Button>
        )}
        {compact && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={openWorkspace}>
            完整工作台
          </Button>
        )}
      </div>

      {notice && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5',
            notice.kind === 'ok' && 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
            notice.kind === 'error' && 'border-destructive/30 bg-destructive/5 text-destructive',
            notice.kind === 'info' && 'border-border bg-muted/40 text-muted-foreground',
          )}
          role="status"
        >
          {notice.kind === 'ok' ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {compact ? (
        <Card className="bg-muted/30">
          <CardContent className="py-3 text-center text-[11px] leading-5 text-muted-foreground">
            回答卡片与综合答案请在完整工作台查看。
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">各模型回答</h2>
              {displaySites.length > 0 && (
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedIds(displaySites.map((site) => site.id))}
                  >
                    全部展开
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setExpandedIds([])}>
                    全部折叠
                  </Button>
                </div>
              )}
            </div>
            {displaySites.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-xs text-muted-foreground">
                  提交问题后会在此显示各模型回答；点击「界面预览」可查看示例渲染效果。
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {displaySites.map((site) => {
                  const response = responseBySite.get(site.id) ?? {
                    siteId: site.id,
                    status: 'pending' as const,
                    content: '',
                    attempts: 0,
                  };
                  return (
                    <ResponseCard
                      key={site.id}
                      site={site}
                      response={response}
                      expanded={expandedIds.includes(site.id)}
                      onToggleExpanded={toggleExpanded}
                      onRetry={(id) => void onRetry(id)}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">综合答案</h2>
              <div className="flex items-center gap-1.5">
                {task.analysis && (
                  <Badge variant="outline">
                    可信度：{task.analysis.confidence === 'medium' ? '中' : '低'} · 非绝对结论
                  </Badge>
                )}
                {finalMarkdown && (
                  <Button variant="ghost" size="sm" onClick={() => void copyFinal()}>
                    {copiedFinal ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedFinal ? '已复制' : '复制最终答案'}
                  </Button>
                )}
                {live && !running && (
                  <Button variant="ghost" size="sm" onClick={() => void analyze()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    重新分析
                  </Button>
                )}
              </div>
            </div>

            <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-xs">多模型裁决结果</CardTitle>
              </CardHeader>
              <CardContent>
                {finalMarkdown ? (
                  <LazyMarkdownView content={finalMarkdown} />
                ) : !live ? (
                  <CardDescription className="leading-6">
                    综合分析包含答案结构化、共同观点、冲突检测、事实核查与最终裁决。
                    无法验证的结论会明确标记，绝不以模型多数投票判定事实，也不会编造引用来源。
                  </CardDescription>
                ) : analysisState === 'analyzing' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {task.analysisStage ?? '正在调用裁决模型进行综合分析…'}
                    </div>
                    <CardDescription className="leading-6">
                      裁决请求可能耗时数十秒；后台在此期间会保持存活，请勿关闭扩展。完成后会自动显示结果。
                    </CardDescription>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div
                      className={cn(
                        'flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs leading-6',
                        analysisState === 'failed'
                          ? 'border-destructive/30 bg-destructive/5 text-destructive'
                          : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
                      )}
                    >
                      <AlertCircle className="mt-1 h-3.5 w-3.5 shrink-0" />
                      <span>{analysisHint}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => void analyze()}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        {analysisState === 'failed' ? '重新分析' : '开始综合分析'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={openSettings}>
                        前往设置
                      </Button>
                    </div>
                  </div>
                )}

                {task.analysis && (
                  <details className="mt-3 border-t pt-2 text-xs">
                    <summary className="cursor-pointer text-[11px] text-muted-foreground">
                      查看详细分析（{task.analysis.factChecks.length} 项事实核查 · {task.analysis.conflicts.length} 项争议）
                    </summary>
                    <div className="mt-2 space-y-3">
                      {task.analysis.coreConclusions.length > 0 && (
                        <div>
                          <div className="font-medium">核心结论</div>
                          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                            {task.analysis.coreConclusions.map((line, index) => (
                              <li key={index}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {task.analysis.factChecks.length > 0 && (
                        <div>
                          <div className="font-medium">事实核查</div>
                          <ul className="mt-1 space-y-1 text-muted-foreground">
                            {task.analysis.factChecks.slice(0, 12).map((item, index) => (
                              <li key={index}>
                                <span className="text-foreground">[{VERIFICATION_LABELS[item.level]}]</span>{' '}
                                {item.claim}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {task.analysis.conflicts.length > 0 && (
                        <div>
                          <div className="font-medium">存在的争议</div>
                          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                            {task.analysis.conflicts.map((item, index) => (
                              <li key={index}>{item.resolution}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {task.analysis.uncertainties.length > 0 && (
                        <div>
                          <div className="font-medium">不确定性</div>
                          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                            {task.analysis.uncertainties.map((line, index) => (
                              <li key={index}>{line}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
