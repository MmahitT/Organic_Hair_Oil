import { create } from 'zustand';
import type { Lang } from '@/content/copy';

const KEY = 'bo-lang';

function read(): Lang {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'en' || v === 'bn') return v;
  } catch { /* storage unavailable */ }
  return 'bn'; // default: Bangla (owner's offer copy is Bangla); confirm with owner
}

interface LangState { lang: Lang; setLang: (l: Lang) => void }

export const useLangStore = create<LangState>((set) => ({
  lang: read(),
  setLang: (lang) => {
    try { window.localStorage.setItem(KEY, lang); } catch { /* ignore */ }
    document.documentElement.lang = lang;
    set({ lang });
  },
}));
