import { Check, Plus } from 'lucide-react';
import { CheckoutForm } from '@/components/shop/CheckoutForm';
import { Button } from '@/components/ui/Button';
import { ProductImage } from '@/components/ui/ProductImage';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useShop } from '@/hooks/useShop';
import { useCheckoutT, useT } from '@/hooks/useT';
import { pName } from '@/lib/productText';
import { useCart } from '@/store/cart';

/** Order directly on the landing page: pick products (add to cart) and check out without leaving the page. All prices come from the server. */
export function OrderSection() {
  const c = useCheckoutT();
  const { t, lang, money } = useT();
  const { products, zones, featured } = useShop();
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  if (products.length === 0) return null;
  const ordered = [...products].sort((a, b) => Number(b.id === featured?.id) - Number(a.id === featured?.id));
  return (
    <section id="order" className="section-pad bg-cream-dark/40" aria-labelledby="order-title">
      <div className="container-page">
        <SectionHeading eyebrow={c.ord.eyebrow} title={c.ord.title} sub={c.ord.sub} />
        <h3 id="order-title" className="sr-only">{c.ord.title}</h3>
        <p className="mb-3 text-sm font-semibold text-forest">{c.ord.pick}</p>
        <ul className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ordered.map((p) => {
            const out = p.maxQty <= 0;
            const inCart = lines.some((l) => l.productId === p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl2 bg-white p-3 shadow-card">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-cream-dark">{p.images[0] && <ProductImage src={p.images[0].url} alt="" className="object-contain" targetWidth={160} />}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{pName(p, lang)}</p>
                  <p className="text-base font-bold text-forest">{money(p.price)}</p>
                </div>
                <Button variant={inCart ? 'outline' : 'primary'} disabled={out} onClick={() => add(p)} aria-label={`${out ? t.stock.out : c.ord.add}: ${pName(p, lang)}`}>
                  {out ? t.stock.out : inCart ? <><Check aria-hidden className="h-4 w-4" />{c.ord.inCart}</> : <><Plus aria-hidden className="h-4 w-4" />{c.ord.add}</>}
                </Button>
              </li>
            );
          })}
        </ul>
        {zones.length > 0 && <p className="mb-6 text-sm text-charcoal-soft">{c.ord.delivery}: {zones.map((z) => `${z.name} ${money(z.fee)}`).join(' · ')}{featured?.freeDelivery ? ` · ${t.offers.comboFree}` : ''}</p>}
        {lines.length === 0 ? <p className="rounded-xl2 border border-dashed border-sage bg-white p-6 text-center text-charcoal-soft">{c.ord.emptyHint}</p> : <CheckoutForm inline />}
      </div>
    </section>
  );
}
