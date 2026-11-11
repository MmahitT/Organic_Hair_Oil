import { X } from 'lucide-react';
import { useState } from 'react';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';

const KEY = 'bo-announce-dismissed-v2';
// Dismissal is remembered per message, so a new announcement shows again.
const dismissed = (text: string) => {
  try { return window.sessionStorage.getItem(KEY) === text; } catch { return false; }
};

export function AnnouncementBar() {
  const { t, f, lang } = useT();
  const { featured, settings } = useShop();
  const a = settings?.announcement;
  // Admin-configured announcement wins (in the visitor's language); the default offer line only shows for a real offer.
  const text = (lang === 'bn' ? a?.textBn ?? a?.text : a?.text ?? a?.textBn) ?? (featured?.freeDelivery ? f(t.announcement) : '');
  const [gone, setGone] = useState<string | null>(null);
  if (!text || gone === text || dismissed(text)) return null;
  return (
    <div className="relative bg-forest text-cream">
      <div className="container-page flex min-h-10 items-center justify-center py-2 pr-8 text-center text-xs font-medium leading-snug sm:text-sm">
        <a href={a?.link ?? '#offer'} className="hover:underline">{text}</a>
      </div>
      <button
        type="button" aria-label={t.nav.close}
        onClick={() => { try { window.sessionStorage.setItem(KEY, text); } catch { /* ignore */ } setGone(text); }}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full hover:bg-forest-600"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
