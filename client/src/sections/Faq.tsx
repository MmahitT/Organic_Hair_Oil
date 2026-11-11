import { Accordion } from '@/components/ui/Accordion';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';

export function Faq() {
  const { t, f, lang } = useT();
  const { settings } = useShop();
  // Questions edited by the owner in Admin → Website replace the built-in ones.
  const custom = settings?.faq ?? [];
  const items = custom.length ? custom.map((i) => ({ q: lang === 'bn' ? i.qBn ?? i.q : i.q, a: lang === 'bn' ? i.aBn ?? i.a : i.a })) : t.faq.items.map((i) => ({ q: i.q, a: f(i.a) }));
  return (
    <section id="faq" className="section-pad">
      <div className="container-page max-w-3xl">
        <SectionHeading eyebrow={t.faq.eyebrow} title={t.faq.title} />
        <Reveal><Accordion items={items} /></Reveal>
      </div>
    </section>
  );
}
