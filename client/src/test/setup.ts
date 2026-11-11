import '@testing-library/jest-dom/vitest';

// Node 26 ships an experimental global localStorage that shadows jsdom's; use a simple in-memory one.
const mem = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  },
});
