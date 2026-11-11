import { FlaskConical, Leaf } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';

/**
 * Shows ingredients the admin has linked to products (verified by the owner). Until any are added we never
 * invent names — we point customers to the printed label instead.
 */
export function Ingredients() {
  const { t, lang } = useT();
  const { products } = useShop();
  const linked = [...new Map(products.flatMap((p) => p.ingredients).map((i) => [i.id, i])).values()];
  return (
    <section id="ingredients" className="section-pad leaf-bg">
      <div className="container-page">
        <SectionHeading eyebrow={t.ingredients.eyebrow} title={t.ingredients.title} sub={t.ingredients.sub} />
        {linked.length > 0 ? (
          <ul className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {linked.map((i, idx) => (
              <li key={i.id}>
                <Reveal delay={(idx % 3) * 0.07} className="h-full">
                  <div className="flex h-full gap-4 rounded-xl2 border border-sage/50 bg-white p-6 shadow-card">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sage-light text-forest"><Leaf aria-hidden className="h-6 w-6" /></span>
                    <div>
                      <h3 className="text-lg font-bold">{lang === 'bn' && i.nameBn ? i.nameBn : i.name}</h3>
                      {i.description && <p className="mt-1 text-sm text-charcoal-soft">{i.description}</p>}
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
              {t.ingredients.cards.map((c, i) => (
                <li key={c.name}>
                  <Reveal delay={i * 0.08} className="h-full">
                    <div className="flex h-full gap-4 rounded-xl2 border border-sage/50 bg-white p-6 shadow-card">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sage-light text-forest"><FlaskConical aria-hidden className="h-6 w-6" /></span>
                      <div><h3 className="text-lg font-bold">{c.name}</h3><p className="mt-1 text-sm text-charcoal-soft">{c.note}</p></div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-center text-sm text-charcoal-soft">{t.ingredients.pending}</p>
          </>
        )}
      </div>
    </section>
  );
}
