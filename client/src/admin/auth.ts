import { create } from 'zustand';
import { ApiError, apiFetch, type ApiResult } from '@/lib/api';

export interface AdminAccount { _id: string; name: string; email: string; role: 'superadmin' | 'admin' | 'staff' }

interface AuthState {
  status: 'unknown' | 'authed' | 'anon';
  token: string | null;
  account: AdminAccount | null;
  restore: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

interface Session { accessToken: string; account: AdminAccount }

// Access token lives in memory only (never localStorage). The httpOnly refresh cookie restores it after a reload.
let refreshing: Promise<boolean> | null = null;

export const useAdminAuth = create<AuthState>((set) => ({
  status: 'unknown',
  token: null,
  account: null,
  restore: () => {
    refreshing ??= apiFetch<Session>('/auth/refresh', { method: 'POST' })
      .then((r) => {
        if (r.data.account.role === undefined || r.data.account.role === ('customer' as string)) throw new ApiError(403, 'FORBIDDEN', 'Not an admin');
        set({ status: 'authed', token: r.data.accessToken, account: r.data.account });
        return true;
      })
      .catch(() => { set({ status: 'anon', token: null, account: null }); return false; })
      .finally(() => { refreshing = null; });
    return refreshing;
  },
  login: async (email, password) => {
    const r = await apiFetch<Session>('/auth/admin/login', { method: 'POST', body: { email, password } });
    set({ status: 'authed', token: r.data.accessToken, account: r.data.account });
  },
  logout: async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { /* cookie cleared best-effort */ }
    set({ status: 'anon', token: null, account: null });
  },
}));

/** Authenticated request with a single transparent token refresh on 401. */
export async function adminFetch<T>(path: string, opts: Parameters<typeof apiFetch>[1] = {}): Promise<ApiResult<T>> {
  const run = () => apiFetch<T>(path, { ...opts, token: useAdminAuth.getState().token });
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await useAdminAuth.getState().restore())) return run();
    throw e;
  }
}

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

/** Authenticated download (invoice page, CSV). A plain link cannot carry the in-memory token, so we fetch and hand the browser a blob. */
export async function adminBlob(path: string): Promise<Blob> {
  const run = () => fetch(`${BASE}${path}`, { credentials: 'include', headers: { Authorization: `Bearer ${useAdminAuth.getState().token ?? ''}`, 'X-Requested-With': 'XMLHttpRequest' } });
  let res = await run();
  if (res.status === 401 && (await useAdminAuth.getState().restore())) res = await run();
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', `Download failed (${res.status})`);
  return res.blob();
}

/** Opens the invoice in a new tab and starts printing (so it can be saved as a PDF). */
export async function openInvoice(orderId: string): Promise<void> {
  const blob = await adminBlob(`/admin/orders/${orderId}/invoice`);
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { URL.revokeObjectURL(url); throw new ApiError(0, 'POPUP_BLOCKED', 'Your browser blocked the invoice tab. Allow pop-ups for this site and try again.'); }
  w.addEventListener('load', () => w.print());
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

export async function downloadFile(path: string, filename: string): Promise<void> {
  const url = URL.createObjectURL(await adminBlob(path));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
