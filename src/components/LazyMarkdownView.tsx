import { lazy, Suspense } from 'react';

/** Markdown / GFM / 语法高亮依赖较重，按需加载，Popup 首屏无需下载。 */
const MarkdownView = lazy(() =>
  import('./MarkdownView').then((module) => ({ default: module.MarkdownView })),
);

export function LazyMarkdownView({ content, className }: { content: string; className?: string }) {
  if (!content.trim()) return null;
  return (
    <Suspense
      fallback={
        <div className="my-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          正在加载 Markdown 渲染器…
        </div>
      }
    >
      <MarkdownView content={content} className={className} />
    </Suspense>
  );
}
