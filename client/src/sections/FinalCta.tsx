import { MessageCircle } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { useOrderNow } from '@/hooks/useOrderNow';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';

export function FinalCta() {
  const { t, f } = useT();
  const { wa, hasWhatsapp } = useShop();
  const { featured, canOrder, orderNow } = useOrderNow();
  return (
    <section className="bg-forest py-16 text-center sm:py-20">
      <Reveal className="container-page max-w-2xl">
        <h2 className="!text-cream text-3xl font-bold sm:text-4xl">{t.finalCta.title}</h2>
        {featured?.freeDelivery && <p className="mt-3 text-sage-light">{f(t.finalCta.text)}</p>}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {featured && <Button size="lg" variant="gold" disabled={!canOrder} onClick={orderNow}>{canOrder ? f(t.finalCta.cta) : t.stock.out}</Button>}
          {hasWhatsapp && (
            <ButtonLink size="lg" variant="light" href={wa(t.wa.greeting)} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden className="h-5 w-5" />{t.hero.whatsapp}
            </ButtonLink>
          )}
        </div>
      </Reveal>
    </section>
  );
}
