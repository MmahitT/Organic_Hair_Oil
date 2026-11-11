import { AlertTriangle, Info } from 'lucide-react';
import { ProductImage } from '@/components/ui/ProductImage';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useT } from '@/hooks/useT';

export function HowToUse() {
  const { t, lang } = useT();
  const num = (n: number) => new Intl.NumberFormat(lang === 'bn' ? 'bn-BD' : 'en-US').format(n);
  return (
    <section id="how-to-use" className="section-pad bg-white">
      <div className="container-page grid items-start gap-10 lg:grid-cols-[1fr_1.2fr]">
        <Reveal className="hidden lg:block">
          <div className="sticky top-28 overflow-hidden rounded-[2rem] bg-white shadow-card">
            <ProductImage src="/images/wooden-comb.jpg" alt={t.gallery.alts[4] ?? ''} className="object-contain p-8" sizes="480px" />
          </div>
        </Reveal>
        <div>
          <SectionHeading align="left" eyebrow={t.howTo.eyebrow} title={t.howTo.title} />
          <ol className="space-y-5">
            {t.howTo.steps.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 0.05} className="flex gap-4">
                  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest font-heading text-lg font-bold text-gold">{num(i + 1)}</span>
                  <div>
                    <h3 className="text-lg font-bold">{s.title}</h3>
                    <p className="mt-0.5 text-charcoal-soft">{s.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
          <div className="mt-8 space-y-3 text-sm">
            <p className="flex gap-2 rounded-xl bg-sage-light p-4 text-forest"><Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{t.howTo.powderNote}</p>
            <p className="flex gap-2 rounded-xl bg-cream-dark p-4 text-charcoal-soft"><AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />{t.howTo.caution}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
