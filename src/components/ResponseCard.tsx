import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Copy,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LazyMarkdownView } from '@/components/LazyMarkdownView';
import { copyToClipboard, cn } from '@/lib/utils';
import { TASK_STATUS_LABELS, type ModelResponse, type SiteConfig, type TaskStatus } from '@/shared/types';

const STATUS_CLASS: Record<TaskStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  'checking-login': 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  submitting: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  streaming: 'bg-primary/10 text-primary',
  completed: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

const EMPTY_HINT: Record<TaskStatus, string> = {
  pending: '等待任务调度（P5 接入）。',
  'checking-login': '正在检查登录状态。',
  submitting: '正在提交问题。',
  streaming: '正在接收回答…',
  completed: '该模型未返回内容。',
  failed: '执行失败。',
  cancelled: '任务已取消。',
};

interface ResponseCardProps {
  site: SiteConfig;
  response: ModelResponse;
  expanded: boolean;
  onToggleExpanded: (siteId: string) => void;
  onRetry: (siteId: string) => void;
}

export function ResponseCard({
  site,
  response,
  expanded,
  onToggleExpanded,
  onRetry,
}: ResponseCardProps) {
  const [copied, setCopied] = useState(false);
  const status = response.status;

  const onCopy = async () => {
    if (!(await copyToClipboard(response.content))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const summary = response.error ?? response.content.split('\n').find((line) => line.trim()) ?? '';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 p-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
          style={{ backgroundColor: site.accent }}
        >
          {site.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{site.name}</span>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
            STATUS_CLASS[status],
          )}
        >
          {status === 'streaming' && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          )}
          {TASK_STATUS_LABELS[status]}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => onToggleExpanded(site.id)}
          aria-label={expanded ? '折叠回答' : '展开回答'}
          title={expanded ? '折叠回答' : '展开回答'}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </CardHeader>

      {!expanded && summary && (
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          <p className="truncate">{summary.replace(/^#+\s*/, '')}</p>
        </div>
      )}

      {expanded && (
        <CardContent className="space-y-3 border-t p-3 pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              {response.durationMs != null ? `${(response.durationMs / 1000).toFixed(1)}s` : '—'}
            </span>
            <span>尝试 {response.attempts} 次</span>
            {site.participateInAnalysis && <Badge variant="outline">参与综合分析</Badge>}
          </div>

          {response.error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-[11px] leading-5 text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{response.error}</span>
            </div>
          )}

          {response.content ? (
            <LazyMarkdownView content={response.content} />
          ) : (
            <p className="py-2 text-xs text-muted-foreground">{EMPTY_HINT[status]}</p>
          )}

          <div className="flex flex-wrap gap-1.5 border-t pt-2">
            <Button variant="ghost" size="sm" onClick={() => void onCopy()} disabled={!response.content}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '已复制' : '复制回答'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onRetry(site.id)}>
              <RotateCcw className="h-3.5 w-3.5" />
              重新提问
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
