import type { HistoryRecord } from '@/shared/types';
import { exportRecords, importRecords } from './HistoryStore';

/** 把一次提问的所有 AI 回答拼成可复制的 Markdown 文本。 */
export function formatHistoryAnswers(
  record: HistoryRecord,
  siteNames: Record<string, string> = {},
): string {
  const lines: string[] = [
    `# ${record.question}`,
    '',
    `提问时间：${new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false })}`,
    `模型数量：${record.responses.length}`,
    '',
  ];

  for (const response of record.responses) {
    const name = siteNames[response.siteId] || response.siteId;
    lines.push(`## ${name}`, '');
    if (response.error) lines.push(`> 执行失败：${response.error}`);
    else if (response.content.trim()) lines.push(response.content.trim());
    else lines.push('（原始回答未保存）');
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/** 浏览器端导出为 JSON 文件；不上传任何数据。 */
export async function downloadHistoryFile(): Promise<void> {
  const json = await exportRecords();
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `omniask-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function importHistoryFile(file: File): Promise<number> {
  return importRecords(await file.text());
}
