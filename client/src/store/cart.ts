import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { track } from '@/lib/analytics';
import type { CartLine } from '@/lib/pricing';
import type { PublicProduct } from '@/types/api';

interface CartState {
  lines: CartLine[];
  zoneKey: string | null;
  couponCode: string | null;
  isOpen: boolean;
  add: (product: PublicProduct, qty?: number) => void;
  setQty: (productId: string, sku: string, qty: number) => void;
  remove: (productId: string, sku: string) => void;
  clear: () => void;
  setZone: (key: string) => void;
  setCoupon: (code: string | null) => void;
  /** Drops lines whose product/SKU no longer exists in the live catalogue. */
  reconcile: (products: PublicProduct[]) => void;
  open: () => void;
  close: () => void;
}

// Storage can be blocked (private mode, cleared site data): never let it break the cart.
const safeStorage: StateStorage = {
  getItem: (k) => { try { return window.localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } },
  removeItem: (k) => { try { window.localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const HARD_MAX_QTY = 10;
const clamp = (n: number, max = HARD_MAX_QTY) => Math.max(1, Math.min(max, Math.floor(n)));
const same = (a: CartLine, productId: string, sku: string) => a.productId === productId && a.sku === sku;

// Only ids + quantities are persisted — prices are never trusted from storage.
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      zoneKey: null,
      couponCode: null,
      isOpen: false,
      add: (product, qty = 1) => {
        const v = product.variants[0];
        if (v && v.maxQty > 0) track('add_to_cart', { items: [{ item_id: v.sku, item_name: product.name, price: v.price ?? product.price, quantity: qty }] });
        set((s) => {
          const variant = product.variants[0];
          if (!variant || variant.maxQty <= 0) return s;
          const max = Math.min(variant.maxQty, HARD_MAX_QTY);
          const existing = s.lines.find((l) => same(l, product.id, variant.sku));
          return {
            lines: existing
              ? s.lines.map((l) => (same(l, product.id, variant.sku) ? { ...l, qty: clamp(l.qty + qty, max) } : l))
              : [...s.lines, { productId: product.id, sku: variant.sku, qty: clamp(qty, max) }],
          };
        });
      },
      setQty: (productId, sku, qty) => set((s) => ({ lines: s.lines.map((l) => (same(l, productId, sku) ? { ...l, qty: clamp(qty) } : l)) })),
      remove: (productId, sku) => set((s) => ({ lines: s.lines.filter((l) => !same(l, productId, sku)) })),
      clear: () => set({ lines: [], couponCode: null }),
      setZone: (zoneKey) => set({ zoneKey }),
      setCoupon: (couponCode) => set({ couponCode }),
      reconcile: (products) =>
        set((s) => {
          const kept = s.lines.filter((l) => products.some((p) => p.id === l.productId && p.variants.some((v) => v.sku === l.sku)));
          return kept.length === s.lines.length ? s : { lines: kept };
        }),
      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
    }),
    {
      name: 'bo-cart-v2', // adding couponCode is backwards compatible (missing => undefined => treated as none)
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ lines: s.lines, zoneKey: s.zoneKey, couponCode: s.couponCode }),
      version: 2,
    },
  ),
);
