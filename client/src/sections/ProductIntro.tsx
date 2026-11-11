import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProductImage } from '@/components/ui/ProductImage';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';
import { cn } from '@/lib/cn';
import { pName, pShort, pSizeLine } from '@/lib/productText';
import { useCart } from '@/store/cart';

export function ProductIntro() {
  const { t, f, lang, money } = useT();
  const { products, featured, wa, hasWhatsapp } = useShop();
  const add = useCart((s) => s.add);
  const open = useCart((s) => s.open);
  const ordered = [...products].sort((a, b) => Number(b.id === featured?.id) - Number(a.id === featured?.id));
  return (
    <section id="products" className="section-pad">
      <div className="container-page">
        <SectionHeading eyebrow={t.products.eyebrow} title={t.products.title} sub={t.products.sub} />
        <Reveal><p className="mx-auto -mt-4 mb-10 max-w-2xl text-center text-charcoal-soft">{t.products.story}</p></Reveal>

        {ordered.length === 0 ? (
          <div className="mx-auto max-w-md rounded-xl2 border border-dashed border-sage bg-white p-8 text-center">
            <h3 className="text-xl font-bold">{t.products.empty}</h3>
            <p className="mt-2 text-charcoal-soft">{t.products.emptyText}</p>
            {hasWhatsapp && <a className="mt-4 inline-flex min-h-11 items-center rounded-full bg-forest px-6 font-semibold text-white" href={wa(t.wa.greeting)} target="_blank" rel="noopener noreferrer">{t.hero.whatsapp}</a>}
          </div>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ordered.map((p, i) => {
              const isFeatured = p.id === featured?.id;
              const out = p.maxQty <= 0;
              const compare = p.bundleValue && p.bundleValue > p.price ? p.bundleValue : p.compareAtPrice;
              return (
                <li key={p.id} className={cn(isFeatured && ordered.length > 2 && 'sm:col-span-2 lg:col-span-1')}>
                  <Reveal delay={i * 0.06} className="h-full">
                    <article className={cn('relative flex h-full flex-col overflow-hidden rounded-xl2 bg-white shadow-card', isFeatured && 'ring-2 ring-gold')}>
                      {isFeatured && <span className="absolute left-3 top-3 z-10 rounded-full bg-gold px-3 py-1 text-xs font-bold text-charcoal">{t.products.comboTag}</span>}
                      <div className="aspect-[4/3] bg-white sm:aspect-square">
                        {p.images[0] && <ProductImage src={p.images[0].url} alt={p.images[0].alt} className={p.type === 'bundle' ? 'object-cover' : 'object-contain p-3'} sizes="(min-width:1024px) 280px, 90vw" targetWidth={640} />}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <h3 className="text-lg font-bold leading-snug">{pName(p, lang)}</h3>
                        <p className="mt-0.5 text-xs font-medium text-gold-dark">{pSizeLine(p, lang)}</p>
                        <p className="mt-2 flex-1 text-sm text-charcoal-soft">{pShort(p, lang)}</p>
                        <p className="mt-3 flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-forest">{money(p.price)}</span>
                          {compare ? <span className="text-sm text-charcoal-soft line-through">{money(compare)}</span> : null}
                        </p>
                        {p.type === 'bundle' && p.bundleValue && p.bundleValue > p.price && <p className="text-xs text-forest">{f(t.products.save)}</p>}
                        {p.stockStatus === 'low_stock' && !out && <p className="mt-1 text-xs font-semibold text-gold-dark">{t.stock.low}</p>}
                        <Button full className="mt-3" variant={isFeatured ? 'primary' : 'outline'} disabled={out} onClick={() => { add(p); open(); }}>
                          {out ? t.stock.out : <><Plus aria-hidden className="h-4 w-4" />{t.products.add}</>}
                        </Button>
                      </div>
                    </article>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
