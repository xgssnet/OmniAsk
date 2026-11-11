import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LazyMarkdownView } from '@/components/LazyMarkdownView';
import { clearRecords, deleteRecord, listRecords } from '@/core/history/HistoryStore';
import {
  downloadHistoryFile,
  formatHistoryAnswers,
  importHistoryFile,
} from '@/core/history/historyFile';
import { useAppState } from '@/state/AppStateProvider';
import { copyToClipboard } from '@/lib/utils';
import { TASK_STATUS_LABELS, type HistoryRecord } from '@/shared/types';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export function HistoryView() {
  const { sites } = useAppState();
  const siteNames = useMemo(
    () => Object.fromEntries(sites.map((site) => [site.id, site.name])),
    [sites],
  );

  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setRecords(await listRecords());
    } catch (error) {
      setMessage(`读取历史失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copy = useCallback(async (key: string, text: string, label: string) => {
    if (!text.trim()) {
      setMessage(`${label}：没有可复制的内容。`);
      return;
    }
    const ok = await copyToClipboard(text);
    if (!ok) {
      setMessage(`${label}：复制失败，请检查浏览器剪贴板权限。`);
      return;
    }
    setMessage('');
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1500);
  }, []);

  const renderCopyButton = (
    key: string,
    label: string,
    text: string,
    disabled = false,
    compact = false,
  ) => {
    const copied = copiedKey === key;
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        className={compact ? 'h-6 px-1.5 text-[10px]' : ''}
        aria-label={label}
        title={label}
        onClick={() => void copy(key, text, label)}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? '已复制' : label}
      </Button>
    );
  };

  const onExport = async () => {
    try {
      await downloadHistoryFile();
      setMessage('已导出 JSON 文件。');
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = await importHistoryFile(file);
      setMessage(`成功导入 ${count} 条记录。`);
      await refresh();
    } catch (error) {
      setMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold">历史记录</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            问题、原始回答与综合分析结果保存在本机 IndexedDB，不会上传。
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => void onExport()}>
            <Download className="h-3.5 w-3.5" />
            导出 JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            导入 JSON
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (!globalThis.confirm('清空全部历史记录？此操作不可撤销。')) return;
              void clearRecords().then(() => {
                setMessage('历史记录已清空。');
                return refresh();
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void onImport(event.target.files?.[0])}
          />
        </div>
      </div>

      {message && (
        <div
          className="rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground"
          role="status"
        >
          {message}
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            正在读取本地记录…
          </CardContent>
        </Card>
      ) : records.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-xs">尚无历史记录</CardTitle>
            <CardDescription>
              完成一次提问后会自动保存。也可以导入此前导出的 JSON 文件。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {records.map((record) => {
            const expanded = expandedId === record.id;
            return (
              <Card key={record.id}>
                <CardHeader className="flex flex-row items-start gap-2 space-y-0 p-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpandedId(expanded ? null : record.id)}
                  >
                    <div className="truncate text-xs font-medium">{record.question}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{formatDate(record.createdAt)}</span>
                      <span>{record.selectedSiteIds.length} 个模型</span>
                      <Badge variant="outline">{TASK_STATUS_LABELS[record.status]}</Badge>
                      {record.analysis && <Badge variant="secondary">含综合答案</Badge>}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {renderCopyButton(
                      `all:${record.id}`,
                      '复制全部',
                      formatHistoryAnswers(record, siteNames),
                      record.responses.length === 0,
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-destructive"
                      aria-label="删除记录"
                      onClick={() => {
                        void deleteRecord(record.id).then(refresh);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>

                {expanded && (
                  <CardContent className="space-y-3 border-t p-3">
                    {record.responses.map((response) => (
                      <div key={response.siteId} className="rounded-md border p-2.5">
                        <div className="mb-1 flex items-center gap-2 text-[11px]">
                          <span className="font-medium">
                            {siteNames[response.siteId] ?? response.siteId}
                          </span>
                          <Badge variant="outline">{TASK_STATUS_LABELS[response.status]}</Badge>
                          <span className="ml-auto">
                            {renderCopyButton(
                              `answer:${record.id}:${response.siteId}`,
                              '复制',
                              response.content,
                              !response.content.trim(),
                              true,
                            )}
                          </span>
                        </div>
                        {response.error ? (
                          <p className="text-[11px] text-destructive">{response.error}</p>
                        ) : response.content ? (
                          <LazyMarkdownView content={response.content} />
                        ) : (
                          <p className="text-[11px] text-muted-foreground">原始回答未保存。</p>
                        )}
                      </div>
                    ))}
                    {record.analysis && (
                      <div className="rounded-md border border-primary/20 p-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-medium">
                            综合答案（裁决模型：{record.analysis.judgeModel}）
                          </div>
                          {renderCopyButton(
                            `analysis:${record.id}`,
                            '复制综合答案',
                            record.analysis.finalAnswer,
                            !record.analysis.finalAnswer.trim(),
                            true,
                          )}
                        </div>
                        <LazyMarkdownView content={record.analysis.finalAnswer} />
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
