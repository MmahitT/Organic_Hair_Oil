import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useOrderNow } from '@/hooks/useOrderNow';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';
import { useCart } from '@/store/cart';

/** Mobile sticky order bar + floating WhatsApp button (shown above the bar on mobile). */
export function FloatingActions() {
  const { t, money } = useT();
  const { wa, hasWhatsapp } = useShop();
  const { featured, canOrder, orderNow } = useOrderNow();
  const isOpen = useCart((s) => s.isOpen);
  if (isOpen) return null;
  return (
    <>
      {hasWhatsapp && (
        <a
          href={wa(t.wa.greeting)} target="_blank" rel="noopener noreferrer" aria-label={t.a11y.whatsappFloat}
          className={`fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-soft transition-transform hover:scale-105 lg:bottom-6 ${featured ? 'bottom-20' : 'bottom-6'}`}
        >
          <MessageCircle aria-hidden className="h-7 w-7" />
        </a>
      )}
      {featured && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-sage/50 bg-cream/95 px-4 py-2.5 shadow-[0_-6px_20px_rgba(35,75,53,0.12)] backdrop-blur lg:hidden" style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-charcoal-soft">{t.sticky.label}</p>
              <p className="text-lg font-bold leading-tight text-forest">{money(featured.price)}</p>
            </div>
            <Button size="lg" variant="gold" className="max-w-[220px] flex-1" disabled={!canOrder} onClick={orderNow}>{canOrder ? t.sticky.cta : t.stock.out}</Button>
          </div>
        </div>
      )}
    </>
  );
}
