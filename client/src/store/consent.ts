import { create } from 'zustand';

const KEY = 'bo-consent-v1';
export interface Consent { analytics: boolean; marketing: boolean; decidedAt: string }

function read(): Consent | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<Consent> | null;
    return v && typeof v.analytics === 'boolean' && typeof v.marketing === 'boolean' ? { analytics: v.analytics, marketing: v.marketing, decidedAt: String(v.decidedAt ?? '') } : null;
  } catch { return null; }
}

interface State {
  /** null = the visitor has not decided yet. Nothing is tracked until they accept. */
  consent: Consent | null;
  /** The detailed "Cookie settings" panel (also opened from the footer link). */
  panelOpen: boolean;
  decide: (c: { analytics: boolean; marketing: boolean }) => void;
  openPanel: () => void;
  closePanel: () => void;
}

export const useConsent = create<State>((set) => ({
  consent: read(),
  panelOpen: false,
  decide: (c) => {
    const consent: Consent = { ...c, decidedAt: new Date().toISOString() };
    try { window.localStorage.setItem(KEY, JSON.stringify(consent)); } catch { /* storage unavailable: the choice lasts for this visit */ }
    set({ consent, panelOpen: false });
  },
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
}));
