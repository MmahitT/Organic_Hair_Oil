import { cn } from '@/lib/cn';

export function SectionHeading({ eyebrow, title, sub, light, align = 'center' }: { eyebrow?: string; title: string; sub?: string; light?: boolean; align?: 'center' | 'left' }) {
  return (
    <div className={cn('mb-10 max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      {eyebrow && (
        <p className={cn('mb-2 text-xs font-semibold uppercase tracking-[0.18em]', light ? 'text-gold-soft' : 'text-gold-dark')}>{eyebrow}</p>
      )}
      <h2 className={cn('text-3xl font-bold leading-tight sm:text-4xl', light && '!text-cream')}>{title}</h2>
      {sub && <p className={cn('mt-3 text-base', light ? 'text-sage-light' : 'text-charcoal-soft')}>{sub}</p>}
    </div>
  );
}
