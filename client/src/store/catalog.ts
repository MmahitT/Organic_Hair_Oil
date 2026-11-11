import { create } from 'zustand';
import { apiFetch } from '@/lib/api';
import type { PublicProduct, PublicSettings } from '@/types/api';

interface CatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  products: PublicProduct[];
  settings: PublicSettings | null;
  error: string | null;
  load: () => Promise<void>;
}

let inflight = false;

/** Server-owned catalogue: prices, stock status, delivery fees and business info always come from the API. */
export const useCatalog = create<CatalogState>((set, get) => ({
  status: 'idle',
  products: [],
  settings: null,
  error: null,
  load: async () => {
    if (inflight) return;
    inflight = true;
    // Background refresh: once we have data the page must never flip back to a loading state (that would
    // unmount forms such as checkout and discard what the customer typed).
    const hadData = get().status === 'ready';
    if (!hadData) set({ status: 'loading', error: null });
    try {
      const [p, s] = await Promise.all([
        apiFetch<{ items: PublicProduct[] }>('/products', { query: { limit: 50 } }),
        apiFetch<PublicSettings>('/settings/public'),
      ]);
      set({ status: 'ready', products: p.data.items, settings: s.data, error: null });
    } catch (e) {
      if (!hadData) set({ status: 'error', error: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      inflight = false;
    }
  },
}));

export function featuredOf(products: PublicProduct[]): PublicProduct | null {
  return products.find((p) => p.isFeatured) ?? products.find((p) => p.type === 'bundle') ?? null;
}

export const productById = (products: PublicProduct[], id: string) => products.find((p) => p.id === id);
