import { localFetch } from "./api";

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  const delays = [100, 500, 1000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await localFetch(url, options);
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      if (attempt < maxRetries) {
        await sleep(delays[attempt] || 1000);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(delays[attempt] || 1000);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`请求失败：已达到最大重试次数 (${maxRetries})`);
}

export async function safeParseJSON<T = unknown>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    throw new Error('API 返回了非 JSON 格式数据');
  }
  return await response.json();
}

export async function safeFetchJSON<T = unknown>(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<T> {
  const response = await fetchWithRetry(url, options, maxRetries);
  if (!response.ok) {
    throw new Error(`请求失败 (${response.status})`);
  }
  return safeParseJSON<T>(response);
}
