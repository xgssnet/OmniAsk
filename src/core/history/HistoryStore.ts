import type { HistoryRecord } from '@/shared/types';

const DB_NAME = 'omniask-history';
const STORE = 'records';
const VERSION = 1;

export const HISTORY_EXPORT_FORMAT = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开 IndexedDB'));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('历史记录操作失败'));
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => db.close();
      }),
  );
}

export async function putRecord(record: HistoryRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record) as IDBRequest<IDBValidKey>);
}

export async function listRecords(): Promise<HistoryRecord[]> {
  const records = await withStore<HistoryRecord[]>('readonly', (store) => store.getAll());
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRecord(id: string): Promise<HistoryRecord | undefined> {
  return withStore<HistoryRecord | undefined>('readonly', (store) => store.get(id));
}

export async function deleteRecord(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

export async function clearRecords(): Promise<void> {
  await withStore('readwrite', (store) => store.clear() as unknown as IDBRequest<undefined>);
}

export async function exportRecords(): Promise<string> {
  const records = await listRecords();
  return JSON.stringify(
    {
      app: 'OmniAsk',
      format: HISTORY_EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      records,
    },
    null,
    2,
  );
}

/** 导入时逐条校验，损坏的条目被跳过，返回成功导入数量。 */
export async function importRecords(json: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('JSON 解析失败，文件可能已损坏。');
  }

  const candidates = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && 'records' in parsed
      ? (parsed as { records: unknown }).records
      : null;

  if (!Array.isArray(candidates)) {
    throw new Error('文件中没有找到 records 数组。');
  }

  let imported = 0;
  for (const item of candidates) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as HistoryRecord).id !== 'string' ||
      typeof (item as HistoryRecord).question !== 'string' ||
      !Array.isArray((item as HistoryRecord).responses)
    ) {
      continue;
    }
    await putRecord(item as HistoryRecord);
    imported += 1;
  }
  return imported;
}
