import { useEffect, useState, type ReactNode } from 'react';
import {
  BadgeCheck,
  Boxes,
  ExternalLink,
  GitCompare,
  History,
  ListChecks,
  MessageSquarePlus,
  Moon,
  Settings,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTheme } from '@/components/ThemeProvider';
import { openWorkspace, pingServiceWorker } from '@/shared/messaging';
import { cn } from '@/lib/utils';

export type ShellVariant = 'compact' | 'standard' | 'full';

type ViewId = 'ask' | 'history' | 'sites' | 'settings';

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  stage: string;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'ask',
    label: '新建问题',
    icon: MessageSquarePlus,
    stage: 'P2',
    description: '输入问题，选择模型，查看各模型回答与综合答案。',
  },
  {
    id: 'history',
    label: '历史记录',
    icon: History,
    stage: 'P7',
    description: '本地保存问题、原始回答与综合分析结果，支持导入导出。',
  },
  {
    id: 'sites',
    label: '模型管理',
    icon: Boxes,
    stage: 'P3',
    description: '管理内置与自定义 AI 网站、选择器规则与适配器。',
  },
  {
    id: 'settings',
    label: '设置',
    icon: Settings,
    stage: 'P7',
    description: '裁决模型、提示词、并发数、主题与数据管理。',
  },
];

type RuntimeState = 'checking' | 'connected' | 'unavailable';

function RuntimeBadge({ state, version }: { state: RuntimeState; version: string }) {
  const label =
    state === 'checking' ? '检测运行时' : state === 'connected' ? `SW v${version}` : '网页调试模式';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          state === 'checking' && 'bg-amber-500',
          state === 'connected' && 'bg-emerald-500',
          state === 'unavailable' && 'bg-muted-foreground/50',
        )}
      />
      {label}
    </span>
  );
}

function ComingSoonPanel({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">{item.label}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
      <Badge variant="outline" className="mt-5">
        计划于 {item.stage} 阶段接入
      </Badge>
    </div>
  );
}

const INSIGHTS = [
  { title: '多模型观点', icon: ListChecks },
  { title: '冲突分析', icon: GitCompare },
  { title: '事实核查', icon: BadgeCheck },
  { title: '最终结论', icon: Sparkles },
];

function InsightPanel() {
  return (
    <aside className="scrollbar-thin hidden w-72 shrink-0 overflow-y-auto border-l bg-muted/20 p-4 xl:block">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">裁决洞察</h2>
      </div>
      <div className="space-y-3">
        {INSIGHTS.map(({ title, icon: Icon }) => (
          <Card key={title} className="bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="leading-5">
                综合分析（P6）生成后在此展示。
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-5 text-[11px] leading-5 text-muted-foreground">
        事实核查不会编造来源；无法验证的结论会被明确标记为「尚未验证」。
      </p>
    </aside>
  );
}

interface AppShellProps {
  variant: ShellVariant;
  initialView?: ViewId;
  children: ReactNode;
}

export function AppShell({ variant, initialView = 'ask', children }: AppShellProps) {
  const { resolved, toggle } = useTheme();
  const [activeView, setActiveView] = useState<ViewId>(initialView);
  const [runtime, setRuntime] = useState<RuntimeState>('checking');
  const [version, setVersion] = useState('—');

  useEffect(() => {
    let alive = true;
    void pingServiceWorker()
      .then((response) => {
        if (!alive) return;
        setVersion(response.version);
        setRuntime('connected');
      })
      .catch(() => {
        if (alive) setRuntime('unavailable');
      });
    return () => {
      alive = false;
    };
  }, []);

  const navigate = (next: ViewId) => {
    setActiveView(next);
    const url = new URL(globalThis.location.href);
    if (next === 'ask') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    globalThis.history.replaceState(null, '', url);
  };

  const showSidebar = variant === 'full';

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {showSidebar && (
        <nav className="hidden w-56 shrink-0 flex-col border-r bg-muted/20 p-3 lg:flex">
          <div className="flex items-center gap-2 px-2 pb-5 pt-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">OmniAsk</div>
              <div className="text-[10px] text-muted-foreground">多模型协同问答</div>
            </div>
          </div>

          <Button className="mb-4 justify-start" size="sm" onClick={() => navigate('ask')}>
            <MessageSquarePlus className="h-4 w-4" />
            新建问题
          </Button>

          <div className="space-y-1">
            {NAV_ITEMS.filter((item) => item.id !== 'ask').map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                    activeView === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[10px] opacity-60">{item.stage}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto rounded-lg border bg-card p-3 text-[11px] leading-5 text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <BadgeCheck className="h-3.5 w-3.5 text-primary" />
              本地优先
            </div>
            问题、回答与 API Key 仅保存在本机，不发送到开发者服务器。
          </div>
        </nav>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <div className="flex min-w-0 items-center gap-2">
            {!showSidebar && (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
            )}
            <span className="truncate text-sm font-semibold">
              {variant === 'compact' ? 'OmniAsk' : '一次提问 · 多模型交叉验证'}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {variant !== 'compact' && <RuntimeBadge state={runtime} version={version} />}
            <Button variant="ghost" size="icon" onClick={toggle} title="切换主题" aria-label="切换主题">
              {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {variant !== 'full' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={openWorkspace}
                title="打开完整工作台"
                aria-label="打开完整工作台"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>
        </header>

        <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {activeView === 'ask' ? (
            children
          ) : (
            <ComingSoonPanel item={NAV_ITEMS.find((item) => item.id === activeView) ?? NAV_ITEMS[0]} />
          )}
        </main>
      </div>

      {showSidebar && activeView === 'ask' && <InsightPanel />}
    </div>
  );
}

export function viewFromUrl(): ViewId {
  const view = new URLSearchParams(globalThis.location.search).get('view');
  return NAV_ITEMS.some((item) => item.id === view) ? (view as ViewId) : 'ask';
}
