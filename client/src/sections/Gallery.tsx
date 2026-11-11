import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProductImage } from '@/components/ui/ProductImage';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { useT } from '@/hooks/useT';
import { cn } from '@/lib/cn';

const images = [
  'lifestyle-products-bougainvillea', 'combo-box-packaging', 'hair-oil-bottle', 'hair-oil-powder-jar', 'wooden-comb',
];
const contain = new Set(['hair-oil-bottle', 'hair-oil-powder-jar', 'wooden-comb']);

export function Gallery() {
  const { t } = useT();
  const [active, setActive] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const step = useCallback((d: number) => setActive((a) => (a === null ? a : (a + d + images.length) % images.length)), []);

  useEffect(() => {
    if (active === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(null);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [active, step]);

  return (
    <section id="gallery" className="section-pad">
      <div className="container-page">
        <SectionHeading eyebrow={t.gallery.eyebrow} title={t.gallery.title} />
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {images.map((name, i) => (
            <li key={name} className="w-[70%] shrink-0 snap-center sm:w-auto">
              <Reveal delay={i * 0.05}>
                <button type="button" onClick={() => setActive(i)} aria-label={`${t.gallery.open}: ${t.gallery.alts[i] ?? ''}`} className="block aspect-[3/4] w-full overflow-hidden rounded-xl2 bg-white shadow-card transition-transform hover:-translate-y-1">
                  <ProductImage src={`/images/${name}.jpg`} alt={t.gallery.alts[i] ?? ''} className={cn(contain.has(name) && 'object-contain p-3')} sizes="(min-width:1024px) 220px, 70vw" />
                </button>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>

      {active !== null && (
        <div role="dialog" aria-modal="true" aria-label={t.gallery.title} className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/90 p-4" onClick={() => setActive(null)}>
          <button ref={closeRef} type="button" aria-label={t.gallery.close} onClick={() => setActive(null)} className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><X aria-hidden /></button>
          <button type="button" aria-label={t.gallery.prev} onClick={(e) => { e.stopPropagation(); step(-1); }} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><ChevronLeft aria-hidden /></button>
          <button type="button" aria-label={t.gallery.next} onClick={(e) => { e.stopPropagation(); step(1); }} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"><ChevronRight aria-hidden /></button>
          <div className="max-h-[85vh] max-w-[min(92vw,640px)]" onClick={(e) => e.stopPropagation()}>
            <picture>
              <source srcSet={`/images/${images[active]}.webp`} type="image/webp" />
              <img src={`/images/${images[active]}.jpg`} alt={t.gallery.alts[active] ?? ''} className="max-h-[85vh] w-auto rounded-xl bg-white object-contain" />
            </picture>
          </div>
        </div>
      )}
    </section>
  );
}
