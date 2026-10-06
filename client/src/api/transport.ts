interface ErrorResponse {
  error?: string;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  if (!text) {
    if (!response.ok) {
      throw new Error(`요청에 실패했습니다. (상태 코드: ${response.status})`);
    }
    return undefined as T;
  }
  let body: T & ErrorResponse;
  try {
    body = JSON.parse(text) as T & ErrorResponse;
  } catch {
    if (!response.ok) {
      throw new Error(`서버와 통신할 수 없습니다. (상태 코드: ${response.status})`);
    }
    throw new Error('서버 응답을 처리하지 못했습니다.');
  }
  if (!response.ok) {
    throw new Error(body.error ?? '요청에 실패했습니다.');
  }
  return body;
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Authenticated JSON transport shared by all feature APIs. */
export function authenticatedRequest<T>(
  token: string,
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  return apiRequest<T>(path, {
    method,
    headers: authHeader(token),
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
