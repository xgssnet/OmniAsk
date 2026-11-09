import { useState, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Send,
  Sparkles,
  Square,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { openWorkspace, pingServiceWorker } from '@/shared/messaging';
import { DEFAULT_SETTINGS } from '@/shared/settings';
import { BUILTIN_SITES } from '@/shared/sites';
import { TASK_STATUS_LABELS } from '@/shared/types';

interface Notice {
  kind: 'ok' | 'error' | 'info';
  text: string;
}

const enabledSites = BUILTIN_SITES.filter((site) => site.enabled);

export function Workspace({ compact = false }: { compact?: boolean }) {
  const [question, setQuestion] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_SETTINGS.defaultSiteIds);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const selectedSites = enabledSites.filter((site) => selectedIds.includes(site.id));

  const toggleSite = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const submit = async () => {
    const value = question.trim();
    if (!value) {
      setNotice({ kind: 'error', text: '请先输入问题。' });
      return;
    }
    if (selectedSites.length === 0) {
      setNotice({ kind: 'error', text: '请至少选择一个 AI 模型。' });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const response = await pingServiceWorker();
      setNotice({
        kind: 'ok',
        text: `运行时链路自检通过：Service Worker v${response.version} 已响应。P1 阶段仅验证链路，问题未发送给任何 AI 网站；任务队列与网站适配器将在 P3–P5 接入。`,
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : '运行时自检失败。',
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

  return (
    <div className={cn('mx-auto w-full max-w-3xl space-y-4', compact ? 'p-3' : 'p-4 md:p-6')}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold">向多个模型提问</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            一次输入，并行获取多个回答，交叉验证后生成最佳答案。
          </p>
        </div>
        <Badge variant="outline">P1 · 基础界面</Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs text-muted-foreground">你的问题</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="例如：Rocky Linux 9 如何部署 Docker，并配置国内镜像源？"
            className={cn('leading-6', compact ? 'min-h-[76px]' : 'min-h-[110px]')}
            aria-label="问题内容"
          />
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
            <span>Enter / Ctrl+Enter 提交 · Shift+Enter 换行</span>
            <span>{question.length} 字</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs text-muted-foreground">选择 AI 模型</CardTitle>
            <span className="text-[11px] text-muted-foreground">已选 {selectedSites.length} 个</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
            {enabledSites.map((site) => {
              const selected = selectedIds.includes(site.id);
              return (
                <button
                  key={site.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleSite(site.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                    selected
                      ? 'border-primary/40 bg-primary/5 text-foreground'
                      : 'border-border bg-transparent text-muted-foreground hover:bg-accent',
                  )}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
                    style={{ backgroundColor: site.accent }}
                  >
                    {site.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{site.name}</span>
                  {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
          <div className="flex items-start gap-1.5 rounded-md bg-amber-500/5 px-2.5 py-2 text-[11px] leading-5 text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              内置站点的选择器为初始候选值，尚未经过真实页面验证，P4 阶段会逐一实测适配，当前不宣称任何站点已兼容。
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          开始提问
        </Button>
        <Button variant="outline" disabled title="任务停止将在 P5 阶段接入">
          <Square className="h-4 w-4" />
          停止任务
        </Button>
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">各模型回答</h2>
              <span className="text-[11px] text-muted-foreground">
                {selectedSites.length} 张卡片
              </span>
            </div>
            {selectedSites.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-xs text-muted-foreground">
                  选择模型后，这里会显示各自的回答卡片。
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {selectedSites.map((site) => (
                  <Card key={site.id}>
                    <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-semibold text-white"
                        style={{ backgroundColor: site.accent }}
                      >
                        {site.icon}
                      </span>
                      <CardTitle className="text-xs">{site.name}</CardTitle>
                      <Badge variant="secondary" className="ml-auto">
                        {TASK_STATUS_LABELS.pending}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="leading-5">
                        回答内容将在 P5（任务队列与回答提取）接入后实时呈现，支持 Markdown 与流式更新。
                      </CardDescription>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">综合答案</h2>
            <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
              <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <CardTitle className="text-xs">多模型裁决结果</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="leading-6">
                  P6 阶段将执行答案结构化、共同观点分析、冲突检测、事实核查与最终裁决。
                  无法验证的结论会明确标记，绝不以模型多数投票判定事实，也不会编造引用来源。
                </CardDescription>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
