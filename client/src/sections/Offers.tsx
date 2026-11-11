import { Check, Gift } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProductImage } from '@/components/ui/ProductImage';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useOrderNow } from '@/hooks/useOrderNow';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';
import { bundleName } from '@/lib/productText';

/** Renders the featured offer from live data; hidden entirely when no offer is published. */
export function Offers() {
  const { t, f, lang, money } = useT();
  const { zones } = useShop();
  const { featured, canOrder, orderNow } = useOrderNow();
  if (!featured) return null;
  const value = featured.bundleValue;
  const hasSavings = Boolean(value && value > featured.price);
  return (
    <section id="offer" className="section-pad bg-forest">
      <div className="container-page">
        <SectionHeading light eyebrow={t.offers.eyebrow} title={f(t.offers.title)} />
        <Reveal>
          <div className="grid overflow-hidden rounded-[2rem] bg-cream shadow-soft lg:grid-cols-2">
            <div className="aspect-[4/3] lg:aspect-auto lg:min-h-[420px]">
              {featured.images[0] && <ProductImage src={featured.images[0].url} alt={featured.images[0].alt} sizes="(min-width:1024px) 560px, 100vw" targetWidth={1000} />}
            </div>
            <div className="p-6 sm:p-10">
              {featured.bundle.length > 0 && (
                <>
                  <p className="text-sm font-semibold uppercase tracking-wider text-gold-dark">{t.offers.includes}</p>
                  <ul className="mt-4 space-y-3">
                    {featured.bundle.map((b) => (
                      <li key={`${b.productId}-${b.label}`} className="flex items-center gap-3 text-base font-medium">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest text-gold">{b.isGift ? <Gift aria-hidden className="h-4 w-4" /> : <Check aria-hidden className="h-4 w-4" />}</span>
                        <span>{bundleName(b, lang)}{b.label && b.label !== 'Standard' ? ` — ${b.label}` : ''}{b.quantity > 1 ? ` × ${b.quantity}` : ''}{b.isGift ? ` (${t.offers.giftTag})` : ''}</span>
                      </li>
                    ))}
                    {featured.freeDelivery && (
                      <li className="flex items-center gap-3 text-base font-medium text-forest">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-charcoal"><Check aria-hidden className="h-4 w-4" /></span>
                        {t.offers.freeDelivery}
                      </li>
                    )}
                  </ul>
                </>
              )}
              <p className="mt-6 flex items-baseline gap-3">
                <span className="text-4xl font-bold text-forest">{money(featured.price)}</span>
                {hasSavings && <span className="text-lg text-charcoal-soft line-through">{money(value!)}</span>}
              </p>
              {hasSavings && <p className="text-sm text-charcoal-soft">{f(t.offers.save)}</p>}
              <Button full size="lg" className="mt-5" disabled={!canOrder} onClick={orderNow}>{canOrder ? f(t.offers.cta) : t.stock.out}</Button>
              {zones.length > 0 && (
                <div className="mt-6 rounded-xl bg-white p-4 text-sm">
                  <p className="mb-2 font-semibold">{t.offers.deliveryTitle}</p>
                  <dl className="space-y-1">
                    {zones.map((z) => <div key={z.key} className="flex justify-between"><dt>{z.name}</dt><dd className="font-semibold">{money(z.fee)}</dd></div>)}
                  </dl>
                  {featured.freeDelivery && <p className="mt-2 font-medium text-forest">{t.offers.comboFree}</p>}
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
