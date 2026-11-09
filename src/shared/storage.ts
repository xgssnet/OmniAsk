/**
 * 本地存储薄封装。
 * 扩展环境使用 chrome.storage.local；Vite dev 网页环境降级到 localStorage，
 * 便于在无扩展上下文下调试 UI。所有数据都留在用户本地。
 */
function getArea(): chrome.storage.LocalStorageArea | null {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      return chrome.storage.local;
    }
  } catch {
    // 非扩展上下文
  }
  return null;
}

export function isExtensionContext(): boolean {
  return getArea() !== null;
}

export async function readStorage<T>(key: string, fallback: T): Promise<T> {
  const area = getArea();
  if (area) {
    try {
      const result = await area.get(key);
      return (result[key] as T | undefined) ?? fallback;
    } catch {
      return fallback;
    }
  }
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeStorage<T>(key: string, value: T): Promise<void> {
  const area = getArea();
  if (area) {
    await area.set({ [key]: value });
    return;
  }
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // 存储不可用时忽略，UI 仍可用
  }
}
