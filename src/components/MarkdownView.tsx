import { useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { cn, copyToClipboard } from '@/lib/utils';

function CodeBlock({ children }: { children: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const ok = await copyToClipboard(preRef.current?.textContent ?? '');
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative my-3">
      <button
        type="button"
        onClick={() => void onCopy()}
        aria-label="复制代码"
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded border border-white/15 bg-white/10 px-1.5 py-1 text-[10px] text-white/80 opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? '已复制' : '复制'}
      </button>
      <pre
        ref={preRef}
        className="scrollbar-thin overflow-x-auto rounded-lg border border-white/10 bg-[#0d1117] p-3 pr-16 text-xs leading-6 text-[#c9d1d9]"
      >
        {children}
      </pre>
    </div>
  );
}

/**
 * 扩展页 CSP 会拦截外部图片，且自动加载远程图片存在隐私风险，
 * 因此把图片渲染为可点击链接而不是 <img>。
 */
const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5">
      {children}
      <ExternalLink className="inline h-3 w-3" />
    </a>
  ),
  img: ({ src, alt }) => (
    <a href={src} target="_blank" rel="noreferrer noopener">
      {alt || src || '图片'}
    </a>
  ),
  table: ({ children }) => (
    <div className="scrollbar-thin my-3 overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

export function MarkdownView({ content, className }: { content: string; className?: string }) {
  if (!content.trim()) return null;
  return (
    <div className={cn('omni-markdown', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
