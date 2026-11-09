import { useMemo, useState } from 'react';
import { CheckCircle2, Info, Search, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SiteConfig } from '@/shared/types';
import { cn } from '@/lib/utils';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface ModelSelectorProps {
  sites: SiteConfig[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClear: () => void;
  onSaveDefault: () => void;
  compact?: boolean;
}

export function ModelSelector({
  sites,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  onSaveDefault,
  compact = false,
}: ModelSelectorProps) {
  const [query, setQuery] = useState('');

  const enabledSites = useMemo(() => sites.filter((site) => site.enabled), [sites]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return sites;
    return sites.filter(
      (site) =>
        site.name.toLowerCase().includes(keyword) || site.url.toLowerCase().includes(keyword),
    );
  }, [sites, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[140px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模型或网址"
            aria-label="搜索模型"
            className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSelectAll(enabledSites.map((site) => site.id))}>
          全选可用
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          清空
        </Button>
        <Button variant="outline" size="sm" onClick={onSaveDefault} title="把当前组合存为默认模型">
          <Star className="h-3.5 w-3.5" />
          设为默认
        </Button>
      </div>

      <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
        {filtered.map((site) => {
          const selected = selectedIds.includes(site.id);
          return (
            <button
              key={site.id}
              type="button"
              aria-pressed={selected}
              disabled={!site.enabled}
              onClick={() => onToggle(site.id)}
              title={site.enabled ? site.url : '该模型已禁用，可在「模型管理」中启用'}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
                selected
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-transparent hover:bg-accent',
                !site.enabled && 'cursor-not-allowed opacity-45',
              )}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white"
                style={{ backgroundColor: site.accent }}
              >
                {site.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{site.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {hostOf(site.url)}
                </span>
              </span>
              {!site.enabled ? (
                <Badge variant="outline" className="shrink-0">已禁用</Badge>
              ) : selected ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : null}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-4 text-center text-xs text-muted-foreground">
            没有匹配的模型。
          </p>
        )}
      </div>

      <div className="flex items-start gap-1.5 rounded-md bg-amber-500/5 px-2.5 py-2 text-[11px] leading-5 text-amber-700 dark:text-amber-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          内置站点的选择器为初始候选值，尚未经过真实页面验证；P4 阶段逐一实测适配，当前不宣称任何站点已兼容。
        </span>
      </div>
    </div>
  );
}
