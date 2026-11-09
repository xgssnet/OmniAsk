import { exportRecords, importRecords } from './HistoryStore';

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
