import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';

/**
 * Loads data for an admin screen with loading / error / reload handling. `key` identifies the query (e.g. the filter
 * values as a string): a new key reloads. A reload keeps the old data on screen (no flash back to a spinner), and an
 * out-of-date response never overwrites a newer one.
 */
export function useLoad<T>(fn: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(fn);
  latest.current = fn;
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true); setError(null);
    try { const r = await latest.current(); if (mine === seq.current) setData(r); } catch (e) { if (mine === seq.current) setError(errMsg(e, 'Something went wrong. Please try again.')); } finally { if (mine === seq.current) setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload, key]);
  return { data, error, loading, reload, setData };
}

/** The server's message — for validation problems, the specific reason (e.g. "Keep the title to 60 characters"). */
export const errMsg = (e: unknown, fallback = 'Something went wrong') => {
  if (!(e instanceof ApiError)) return fallback;
  const first = e.code === 'VALIDATION_ERROR' ? e.details?.[0]?.message : undefined;
  return first ?? e.message;
};

/** "YYYY-MM-DD" in Bangladesh time, offset by whole days. */
export function dhakaDate(offsetDays = 0): string {
  return new Date(Date.now() + 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}
