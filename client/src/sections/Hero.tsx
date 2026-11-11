import { BadgeCheck, MessageCircle, Star, Truck, Wallet } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ProductImage } from '@/components/ui/ProductImage';
import { Reveal } from '@/components/ui/Reveal';
import { useOrderNow } from '@/hooks/useOrderNow';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';

export function Hero() {
  const { t, f, money } = useT();
  const { wa, hasWhatsapp } = useShop();
  const { featured, canOrder, orderNow } = useOrderNow();
  const icons = [Truck, Wallet, BadgeCheck];
  return (
    <section id="top" className="leaf-bg overflow-hidden">
      <div className="container-page grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-2 lg:gap-14 lg:py-20">
        <div className="order-2 text-center lg:order-1 lg:text-left">
          <Reveal>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gold-dark">{t.hero.eyebrow}</p>
            <h1 className="text-4xl font-bold leading-[1.15] sm:text-5xl lg:text-6xl">{t.hero.title}</h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-charcoal-soft sm:text-lg lg:mx-0">{t.hero.sub}</p>
          </Reveal>
          <Reveal delay={0.1}>
            {featured && (
              <div className="mt-6 flex items-center justify-center gap-3 lg:justify-start">
                <span className="text-4xl font-bold text-forest">{money(featured.price)}</span>
                {(featured.bundleValue ?? featured.compareAtPrice) ? <span className="text-lg text-charcoal-soft line-through">{money((featured.bundleValue ?? featured.compareAtPrice)!)}</span> : null}
              </div>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
              {featured ? (
                <Button size="lg" disabled={!canOrder} onClick={orderNow}>{canOrder ? f(t.hero.cta) : t.stock.out}</Button>
              ) : (
                <ButtonLink size="lg" href="#products">{t.cart.emptyCta}</ButtonLink>
              )}
              {hasWhatsapp && (
                <ButtonLink size="lg" variant="outline" href={wa(t.wa.greeting)} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden className="h-5 w-5" />{t.hero.whatsapp}
                </ButtonLink>
              )}
            </div>
            <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-forest lg:justify-start">
              {t.hero.points.map((p, i) => {
                const Icon = icons[i] ?? BadgeCheck;
                return <li key={p} className="flex items-center gap-1.5"><Icon aria-hidden className="h-4 w-4 text-gold-dark" />{p}</li>;
              })}
            </ul>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-soft lg:justify-start">
              <Star aria-hidden className="h-3.5 w-3.5 text-gold" />{t.hero.rating}
            </p>
          </Reveal>
        </div>
        <Reveal className="order-1 lg:order-2">
          <div className="relative mx-auto max-w-sm sm:max-w-md">
            <div aria-hidden className="absolute -inset-3 rounded-[2.5rem] bg-sage/40" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-soft sm:aspect-[3/4]">
              <ProductImage src="/images/lifestyle-products-bougainvillea.jpg" alt={t.gallery.alts[0] ?? ''} eager sizes="(min-width:1024px) 448px, 90vw" width={1100} height={1467} className="object-[50%_40%]" />
            </div>
            {featured?.freeDelivery && <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-5 py-2 text-sm font-bold text-charcoal shadow-soft">{t.hero.badge}</div>}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
