import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '@/lib/cn';

export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const uid = useId();
  return (
    <div className="divide-y divide-sage/50 rounded-xl2 bg-white shadow-card">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q}>
            <h3>
              <button
                type="button"
                id={`${uid}-h-${i}`}
                aria-expanded={isOpen}
                aria-controls={`${uid}-p-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left font-body text-base font-semibold !text-charcoal"
              >
                {it.q}
                <ChevronDown aria-hidden className={cn('h-5 w-5 shrink-0 text-forest transition-transform', isOpen && 'rotate-180')} />
              </button>
            </h3>
            <div id={`${uid}-p-${i}`} role="region" aria-labelledby={`${uid}-h-${i}`} hidden={!isOpen} className="px-5 pb-5 text-charcoal-soft">
              {it.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}
