const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: { path: string; message: string }[]) {
    super(message);
  }
}

interface Options extends Omit<RequestInit, 'body'> { body?: unknown; token?: string | null; query?: Record<string, string | number | boolean | undefined> }

export interface ApiResult<T> { data: T; meta?: { page: number; limit: number; total: number } }

/** Thin fetch wrapper for the API's { success, data, meta, error } envelope. */
export async function apiFetch<T>(path: string, opts: Options = {}): Promise<ApiResult<T>> {
  const { body, token, query, headers, ...rest } = opts;
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs}`, {
      credentials: 'include',
      ...rest,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'X-Requested-With': 'XMLHttpRequest', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return { data: undefined as T };
  let json: { success?: boolean; data?: T; meta?: ApiResult<T>['meta']; error?: { code: string; message: string; details?: ApiError['details'] } } | null = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok || !json?.success) {
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  }
  return { data: json.data as T, meta: json.meta };
}
