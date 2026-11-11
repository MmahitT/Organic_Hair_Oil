import { Droplets, Gift, HeartHandshake, Leaf, ShoppingBag, Sparkles } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useT } from '@/hooks/useT';

const icons = [Leaf, Droplets, Sparkles, ShoppingBag, Gift, HeartHandshake];

export function Benefits() {
  const { t } = useT();
  return (
    <section id="benefits" className="section-pad bg-white">
      <div className="container-page">
        <SectionHeading eyebrow={t.benefits.eyebrow} title={t.benefits.title} />
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {t.benefits.items.map((b, i) => {
            const Icon = icons[i] ?? Leaf;
            return (
              <li key={b.title}>
                <Reveal delay={(i % 3) * 0.07} className="h-full">
                  <div className="h-full rounded-xl2 bg-cream p-6">
                    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-forest text-gold"><Icon aria-hidden className="h-6 w-6" /></span>
                    <h3 className="text-lg font-bold">{b.title}</h3>
                    <p className="mt-1.5 text-sm text-charcoal-soft">{b.text}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
        <p className="mt-6 text-center text-xs text-charcoal-soft">{t.benefits.disclaimer}</p>
      </div>
    </section>
  );
}
