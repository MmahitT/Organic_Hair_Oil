import { Gift, MessageCircle, Truck, Wallet, MapPin } from 'lucide-react';
import { Reveal } from '@/components/ui/Reveal';
import { useT } from '@/hooks/useT';

const icons = [Wallet, MapPin, Truck, MessageCircle, Gift];

export function TrustIndicators() {
  const { t } = useT();
  return (
    <section aria-label="Trust" className="border-y border-sage/40 bg-white">
      <ul className="container-page grid grid-cols-2 gap-x-4 gap-y-6 py-8 lg:grid-cols-5">
        {t.trust.map((it, i) => {
          const Icon = icons[i] ?? Gift;
          return (
            <li key={it.title} className={i === 4 ? 'col-span-2 lg:col-span-1' : ''}>
              <Reveal delay={i * 0.05} className="flex flex-col items-center text-center">
                <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-sage-light text-forest"><Icon aria-hidden className="h-6 w-6" /></span>
                <p className="text-sm font-semibold">{it.title}</p>
                <p className="mt-0.5 text-xs text-charcoal-soft">{it.text}</p>
              </Reveal>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
