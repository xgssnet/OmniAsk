import { useRef, useState, type ReactNode } from 'react';
import { Download, Eye, EyeOff, Info, Loader2, PlugZap, Star, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useTheme } from '@/components/ThemeProvider';
import { useAppState } from '@/state/AppStateProvider';
import { requestJudgeOrigin } from '@/core/judge/permissions';
import { testJudgeConnection } from '@/core/judge/connection';
import { withTimeout } from '@/lib/timeout';
import {
  MESSAGE_TYPES,
  sendToBackground,
  type TestJudgeResponse,
} from '@/shared/messaging';
import { clearRecords } from '@/core/history/HistoryStore';
import { downloadHistoryFile, importHistoryFile } from '@/core/history/historyFile';
import { cn } from '@/lib/utils';
import type { ThemeMode } from '@/shared/types';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

const inputClass =
  'h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring';

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-xs font-medium">{title}</div>
        {description && (
          <div className="mt-0.5 max-w-md text-[11px] leading-5 text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsView() {
  const { settings, updateSettings, draft, saveDefaultSelection } = useAppState();
  const { setTheme } = useTheme();
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [judgeTesting, setJudgeTesting] = useState(false);
  const [judgeStage, setJudgeStage] = useState('');
  const [judgeTest, setJudgeTest] = useState<TestJudgeResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onBaseUrlBlur = async () => {
    if (!settings.judge.baseUrl.trim()) return;
    const granted = await requestJudgeOrigin(settings.judge.baseUrl);
    setMessage(
      granted
        ? '已获得 API 域名访问权限。'
        : '未获得 API 域名访问权限，综合分析将失败。请重试并允许权限请求。',
    );
  };

  const onTestJudge = async () => {
    setJudgeTest(null);
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      setJudgeTest({
        ok: false,
        detail: '当前是网页调试模式，请在 chrome://extensions 加载 dist 后再测试。',
        latencyMs: 0,
      });
      return;
    }

    const startedAt = Date.now();
    setJudgeTesting(true);
    setJudgeStage('准备测试…');
    try {
      // 权限弹窗可能长时间不返回，最多等待 4 秒，之后继续由后台给出明确错误
      setJudgeStage('检查 API 域名权限…');
      try {
        await withTimeout(requestJudgeOrigin(settings.judge.baseUrl), 4_000, '权限请求');
      } catch (error) {
        console.debug('[omniask] 权限请求未完成：', error);
      }

      // 优先走后台，与真实裁决调用路径一致
      setJudgeStage('正在通过后台 Service Worker 测试…');
      let result: TestJudgeResponse;
      let usedFallback = false;
      try {
        result = await withTimeout(
          sendToBackground<TestJudgeResponse>({
            type: MESSAGE_TYPES.TEST_JUDGE,
            config: settings.judge,
          }),
          8_000,
          '后台响应',
        );
      } catch (error) {
        console.debug('[omniask] 后台未响应，改用前台直接测试：', error);
        usedFallback = true;
        setJudgeStage('后台未响应，改用前台直接测试…');
        result = await testJudgeConnection(settings.judge);
      }

      if (!result || typeof result.ok !== 'boolean') {
        throw new Error('后台返回了无效结果，请在 chrome://extensions 重新加载扩展后重试。');
      }

      setJudgeTest({
        ...result,
        detail: usedFallback
          ? `${result.detail}（后台未响应，已由前台完成测试；请在 chrome://extensions 点击「重新加载」以恢复完整后台路径）`
          : result.detail,
      });
    } catch (error) {
      setJudgeTest({
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      setJudgeTesting(false);
      setJudgeStage('');
    }
  };

  const onGrantAndRetry = async () => {
    const granted = await requestJudgeOrigin(settings.judge.baseUrl);
    setMessage(
      granted
        ? '已获得 API 域名权限，正在重新测试…'
        : '权限未被授予，请在浏览器弹窗中选择「允许」后重试。',
    );
    if (granted) await onTestJudge();
  };

  const onExport = async () => {
    try {
      await downloadHistoryFile();
      setMessage('已导出历史记录 JSON。');
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = await importHistoryFile(file);
      setMessage(`成功导入 ${count} 条历史记录。`);
    } catch (error) {
      setMessage(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-base font-semibold">设置</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          所有配置仅保存在本机（chrome.storage.local），修改后自动生效。
        </p>
      </div>

      {message && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground" role="status">
          {message}
        </div>
      )}

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-xs">通用设置</CardTitle>
        </CardHeader>
        <CardContent>
          <Row title="主题" description="切换界面外观，偏好会随配置一起保存。">
            <div className="flex gap-1">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-[11px] transition-colors',
                    settings.theme === option.value
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Row>

          <Row title="默认提问模型" description={`当前默认 ${settings.defaultSiteIds.length} 个模型。`}>
            <Button variant="outline" size="sm" onClick={saveDefaultSelection}>
              <Star className="h-3.5 w-3.5" />
              使用当前选择（{draft.selectedSiteIds.length}）
            </Button>
          </Row>

          <Row title="最大并发数" description="同时提问的模型数量上限，避免过多标签页影响浏览器性能。">
            <input
              type="number"
              min={1}
              max={10}
              value={settings.maxConcurrency}
              onChange={(event) =>
                updateSettings({
                  maxConcurrency: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                })
              }
              className={cn(inputClass, 'w-20')}
              aria-label="最大并发数"
            />
          </Row>

          <Row
            title="任务结束后自动关闭标签页"
            description="只关闭本插件本次新建的后台标签页，绝不动你已打开的页面。关闭此开关可保留标签页供下次直接复用，也可在浏览器里核对原始页面。"
          >
            <Switch
              checked={settings.closeTabsAfterTask}
              onCheckedChange={(closeTabsAfterTask) => updateSettings({ closeTabsAfterTask })}
              aria-label="任务结束后自动关闭标签页"
            />
          </Row>
          <Row title="自动开始综合分析" description="所有模型回答结束后自动调用裁决模型。">
            <Switch
              checked={settings.autoAnalysis}
              onCheckedChange={(autoAnalysis) => updateSettings({ autoAnalysis })}
              aria-label="自动开始综合分析"
            />
          </Row>
          <Row
            title="联网核查偏好"
            description="指示裁决模型优先核验。当前没有独立检索源，来源只能取自模型回答中真实出现的网址，其余结论一律标记为尚未验证。"
          >
            <Switch
              checked={settings.onlineFactCheck}
              onCheckedChange={(onlineFactCheck) => updateSettings({ onlineFactCheck })}
              aria-label="联网核查偏好"
            />
          </Row>
          <Row title="显示详细分析" description="展示结构化、共同观点与冲突检测过程。">
            <Switch
              checked={settings.showDetailedAnalysis}
              onCheckedChange={(showDetailedAnalysis) => updateSettings({ showDetailedAnalysis })}
              aria-label="显示详细分析"
            />
          </Row>
          <Row title="保存原始回答" description="关闭后历史记录中只保留综合答案与任务状态。">
            <Switch
              checked={settings.saveRawResponses}
              onCheckedChange={(saveRawResponses) => updateSettings({ saveRawResponses })}
              aria-label="保存原始回答"
            />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
          <div>
            <CardTitle className="text-xs">综合分析设置</CardTitle>
            <CardDescription className="mt-1">
              OpenAI Compatible API；API Key 仅存本地，只发往你填写的地址。
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={judgeTesting}
              onClick={() => void onTestJudge()}
              title="向该 API 发送一条极短消息验证连通性"
            >
              {judgeTesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlugZap className="h-3.5 w-3.5" />
              )}
              {judgeTesting ? '测试中…' : '测试连接'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdvancedOpen((open) => !open)}>
              {advancedOpen ? '收起' : '展开'}
            </Button>
          </div>
        </CardHeader>
        {advancedOpen && (
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">API Base URL</span>
                <input
                  value={settings.judge.baseUrl}
                  onChange={(event) =>
                    updateSettings({ judge: { ...settings.judge, baseUrl: event.target.value } })
                  }
                  onBlur={() => void onBaseUrlBlur()}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">Model</span>
                <input
                  value={settings.judge.model}
                  onChange={(event) =>
                    updateSettings({ judge: { ...settings.judge, model: event.target.value } })
                  }
                  className={inputClass}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">API Key（仅存本地）</span>
                <span className="relative block">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={settings.judge.apiKey}
                    onChange={(event) =>
                      updateSettings({ judge: { ...settings.judge, apiKey: event.target.value } })
                    }
                    placeholder="未配置"
                    className={cn(inputClass, 'pr-8')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((visible) => !visible)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Temperature</span>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={settings.judge.temperature}
                    onChange={(event) =>
                      updateSettings({
                        judge: { ...settings.judge, temperature: Number(event.target.value) || 0 },
                      })
                    }
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Max Tokens</span>
                  <input
                    type="number"
                    min={256}
                    max={32768}
                    step={256}
                    value={settings.judge.maxTokens}
                    onChange={(event) =>
                      updateSettings({
                        judge: { ...settings.judge, maxTokens: Number(event.target.value) || 4096 },
                      })
                    }
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">综合裁决系统提示词（可编辑）</span>
              <Textarea
                value={settings.judgePrompt}
                onChange={(event) => updateSettings({ judgePrompt: event.target.value })}
                className="min-h-[140px] font-mono text-[11px] leading-5"
              />
            </label>
            <div className="flex items-start gap-1.5 rounded-md bg-muted/40 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                修改 Base URL 后需要允许浏览器弹出的权限请求，否则后台 fetch 会被 CSP 拦截。
                「测试连接」会向该 API 发送一条极短消息（max_tokens=16），可能产生极小费用；结果不保存、不触发任务。
                不配置 API Key 时仍可查看各模型原始回答，但不会生成综合裁决。
              </span>
            </div>
          </CardContent>
        )}

        {(judgeTesting || judgeTest) && (
          <div
            className={cn(
              'mx-4 mb-4 rounded-md border px-3 py-2.5 text-[11px] leading-5',
              judgeTesting
                ? 'border-primary/30 bg-primary/5 text-foreground'
                : judgeTest?.ok
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                  : 'border-destructive/30 bg-destructive/5 text-destructive',
            )}
            role="status"
          >
            {judgeTesting ? (
              <>
                <div className="flex items-center gap-1.5 font-medium">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  正在测试连接…
                </div>
                <div className="opacity-80">{judgeStage}</div>
                <div className="mt-1 opacity-70">
                  最长约 20 秒；若一直停留在此界面，请在 chrome://extensions 点击「重新加载」后重试。
                </div>
              </>
            ) : (
              <>
                <div className="font-medium">{judgeTest?.ok ? '✓ 连接成功' : '✗ 连接失败'}</div>
                <div>{judgeTest?.detail}</div>
                {judgeTest?.status !== undefined && (
                  <div className="opacity-80">
                    HTTP {judgeTest.status} · 耗时 {judgeTest.latencyMs} ms
                  </div>
                )}
                {judgeTest?.sample && <div className="opacity-80">模型返回：{judgeTest.sample}</div>}
                {!judgeTest?.ok && (
                  <>
                    <div className="mt-1 opacity-80">
                      排查顺序：API Key → Base URL（通常需以 /v1 结尾）→ Model 名称 → 允许浏览器权限请求 → 网络/代理 → 在 chrome://extensions 重新加载扩展。
                    </div>
                    {judgeTest?.needsPermission && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => void onGrantAndRetry()}
                      >
                        授予权限并重试
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-xs">数据管理</CardTitle>
          <CardDescription className="mt-1">
            历史记录保存在本机 IndexedDB，可导出为 JSON 备份或导入恢复。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
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
              void clearRecords().then(() => setMessage('历史记录已清空。'));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空历史
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void onImport(event.target.files?.[0])}
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline">隐私</Badge>
        不收集账号密码、Cookie、Session Token；问题与回答不上传开发者服务器。
      </div>
    </div>
  );
}
