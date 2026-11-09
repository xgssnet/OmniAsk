import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Info, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useAppState } from '@/state/AppStateProvider';
import { cn } from '@/lib/utils';
import {
  createCustomSite,
  requestSitePermission,
  validateSite,
} from '@/core/sites/siteConfig';
import {
  MESSAGE_TYPES,
  sendToBackground,
  type TestKind,
  type TestSiteResponse,
} from '@/shared/messaging';
import type { SelectorConfig, SiteConfig } from '@/shared/types';

const SELECTOR_FIELDS: Array<{ key: keyof SelectorConfig; label: string; placeholder: string }> = [
  { key: 'input', label: '输入框', placeholder: 'textarea, div[contenteditable="true"]' },
  { key: 'sendButton', label: '发送按钮', placeholder: 'button[aria-label="发送"]' },
  { key: 'response', label: '回答内容', placeholder: '.markdown-body' },
  { key: 'responseContainer', label: '回答容器（可选）', placeholder: '[data-role="assistant"]' },
  { key: 'loggedIn', label: '已登录标记（可选）', placeholder: '[data-testid="avatar"]' },
  { key: 'loggedOut', label: '未登录标记（可选）', placeholder: 'a[href*="login"]' },
  { key: 'streamingIndicator', label: '流式标记（可选）', placeholder: 'button[aria-label="停止"]' },
  { key: 'completionIndicator', label: '完成标记（可选）', placeholder: '[data-state="done"]' },
];

const TEST_LABELS: Array<{ kind: TestKind; label: string }> = [
  { kind: 'connection', label: '测试连接' },
  { kind: 'login', label: '测试登录' },
  { kind: 'selectors', label: '测试输入/发送/回答选择器' },
];

const inputClass =
  'h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function openSite(url: string): void {
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    void chrome.tabs.create({ url });
    return;
  }
  globalThis.open(url, '_blank');
}

interface TestResult extends TestSiteResponse {
  kind: TestKind;
}

export function SitesView() {
  const { sites, updateSite, addSite, removeSite, resetSites } = useAppState();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [formError, setFormError] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});

  const onAdd = async () => {
    setFormError('');
    const site = createCustomSite({ name: newName, url: newUrl });
    const errors = validateSite(site);
    if (errors.length) {
      setFormError(errors.join('；'));
      return;
    }
    const granted = await requestSitePermission(site.url);
    if (!granted) {
      setFormError('未授予该站点的访问权限，插件无法注入内容脚本。请重试并允许权限请求。');
      return;
    }
    addSite(site);
    setNewName('');
    setNewUrl('');
    setAdding(false);
    setExpandedId(site.id);
  };

  const runTest = async (site: SiteConfig, kind: TestKind) => {
    const key = `${site.id}:${kind}`;
    setTesting(key);
    try {
      const response = await sendToBackground<TestSiteResponse>({
        type: MESSAGE_TYPES.TEST_SITE,
        site,
        kind,
      });
      setResults((current) => ({ ...current, [key]: { ...response, kind } }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [key]: {
          ok: false,
          kind,
          detail: error instanceof Error ? error.message : '测试失败',
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const resultFor = (siteId: string): TestResult[] =>
    TEST_LABELS.map(({ kind }) => results[`${siteId}:${kind}`]).filter(
      (item): item is TestResult => Boolean(item),
    );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold">模型管理</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            启用站点、编辑选择器、测试连接与登录状态；配置仅保存在本地。
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setAdding((open) => !open)}>
            <Plus className="h-3.5 w-3.5" />
            添加网站
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (globalThis.confirm('恢复内置站点的默认配置？自定义站点不会被删除。')) resetSites();
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            恢复默认
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-1.5 rounded-lg border bg-muted/30 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          内置站点的选择器是初始候选值，<strong>尚未在真实登录页面验证</strong>；请以本页测试结果为准自行调整。
          自定义网站需要你显式授予运行时主机权限，插件不会读取或上传 Cookie、Session Token 与密码。
        </span>
      </div>

      {adding && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">添加 AI 网站</CardTitle>
            <CardDescription>添加后可在展开区域配置 CSS 选择器并逐项测试。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="网站名称，例如 自建助手"
                className={inputClass}
                aria-label="网站名称"
              />
              <input
                value={newUrl}
                onChange={(event) => setNewUrl(event.target.value)}
                placeholder="https://example.com/chat"
                className={inputClass}
                aria-label="网站 URL"
              />
            </div>
            {formError && <p className="text-[11px] text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void onAdd()}>
                添加并授权
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs">站点列表（{sites.length}）</CardTitle>
          <CardDescription>禁用后不会出现在提问模型选择器中。</CardDescription>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {sites.map((site) => {
            const expanded = expandedId === site.id;
            const tests = resultFor(site.id);
            return (
              <div key={site.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
                    style={{ backgroundColor: site.accent }}
                  >
                    {site.icon}
                  </span>
                  <div className="min-w-[110px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{site.name}</span>
                      {site.custom ? (
                        <Badge variant="outline">自定义</Badge>
                      ) : (
                        <Badge variant="secondary">未验证</Badge>
                      )}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">{hostOf(site.url)}</div>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Switch
                      checked={site.enabled}
                      onCheckedChange={(enabled) => updateSite(site.id, { enabled })}
                      aria-label={`${site.name} 启用`}
                    />
                    启用
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Switch
                      checked={site.participateInAnalysis}
                      onCheckedChange={(participateInAnalysis) =>
                        updateSite(site.id, { participateInAnalysis })
                      }
                      aria-label={`${site.name} 参与综合分析`}
                    />
                    参与分析
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setExpandedId(expanded ? null : site.id)}
                    aria-label={expanded ? '收起配置' : '展开配置'}
                  >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {expanded && (
                  <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {SELECTOR_FIELDS.map(({ key, label, placeholder }) => (
                        <label key={key} className="block space-y-1">
                          <span className="text-[10px] text-muted-foreground">{label}</span>
                          <input
                            value={site.selectors[key] ?? ''}
                            onChange={(event) =>
                              updateSite(site.id, {
                                selectors: { ...site.selectors, [key]: event.target.value },
                              })
                            }
                            placeholder={placeholder}
                            className={cn(inputClass, 'font-mono text-[10px]')}
                          />
                        </label>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Switch
                          checked={site.supportsStreaming}
                          onCheckedChange={(supportsStreaming) =>
                            updateSite(site.id, { supportsStreaming })
                          }
                          aria-label="支持流式输出"
                        />
                        流式输出
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        超时
                        <input
                          type="number"
                          min={10}
                          max={600}
                          value={Math.round(site.timeoutMs / 1000)}
                          onChange={(event) =>
                            updateSite(site.id, {
                              timeoutMs: Math.min(600, Math.max(10, Number(event.target.value) || 120)) * 1000,
                            })
                          }
                          className={cn(inputClass, 'w-20')}
                          aria-label="超时秒数"
                        />
                        秒
                      </label>
                      <Button variant="ghost" size="sm" onClick={() => openSite(site.url)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        打开登录页
                      </Button>
                      {site.custom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => {
                            if (globalThis.confirm(`删除「${site.name}」？此操作不可撤销。`)) {
                              removeSite(site.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 border-t pt-2">
                      {TEST_LABELS.map(({ kind, label }) => (
                        <Button
                          key={kind}
                          variant="outline"
                          size="sm"
                          disabled={testing !== null}
                          onClick={() => void runTest(site, kind)}
                        >
                          {testing === `${site.id}:${kind}` ? '测试中…' : label}
                        </Button>
                      ))}
                    </div>

                    {tests.length > 0 && (
                      <div className="space-y-1.5">
                        {tests.map((result) => (
                          <div
                            key={result.kind}
                            className={cn(
                              'rounded-md border px-2.5 py-2 text-[11px] leading-5',
                              result.ok
                                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                                : 'border-destructive/30 bg-destructive/5 text-destructive',
                            )}
                          >
                            <div className="font-medium">{TEST_LABELS.find((t) => t.kind === result.kind)?.label}</div>
                            <div>{result.detail}</div>
                            {result.login && !result.login.reliable && (
                              <div>无法可靠判断登录状态，请在站点完成登录后手动确认。</div>
                            )}
                            {result.checks?.map((check) => (
                              <div key={check.name}>
                                {check.found ? '✓' : '✗'} {check.name}：匹配 {check.count} 个 · {check.detail}
                                {check.sample && (
                                  <div className="pl-3 opacity-80">示例：{check.sample}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
