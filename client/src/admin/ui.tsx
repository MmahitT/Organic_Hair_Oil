import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Shared with the storefront checkout form.
export { Field, Input, Select, Textarea, inputCls } from '@/components/ui/Form';

type Tone = 'primary' | 'secondary' | 'danger' | 'ghost';
const tones: Record<Tone, string> = {
  primary: 'bg-forest text-white hover:bg-forest-700',
  secondary: 'border border-forest text-forest hover:bg-sage-light',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-forest hover:bg-sage-light',
};
export function Btn({ tone = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button type="button" className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50', tones[tone], className)} {...p} />;
}

export function Card({ title, children, className, actions }: { title?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn('rounded-xl bg-white p-5 shadow-card', className)}>
      {(title || actions) && <div className="mb-4 flex items-center justify-between gap-3">{title && <h2 className="text-lg font-bold">{title}</h2>}{actions}</div>}
      {children}
    </section>
  );
}

const badge: Record<string, string> = {
  published: 'bg-sage-light text-forest', draft: 'bg-cream-dark text-charcoal-soft', hidden: 'bg-gold/20 text-gold-dark',
  in_stock: 'bg-sage-light text-forest', low_stock: 'bg-gold/20 text-gold-dark', out_of_stock: 'bg-danger/10 text-danger',
};
export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', badge[kind] ?? 'bg-cream-dark text-charcoal-soft')}>{children}</span>;
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const c = { error: 'border-danger/40 bg-danger/5 text-danger', success: 'border-forest/40 bg-sage-light text-forest', info: 'border-gold/50 bg-gold/10 text-gold-dark' }[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', c)}>{children}</div>;
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-charcoal-soft">{total} item{total === 1 ? '' : 's'}</span>
      <div className="flex items-center gap-2">
        <Btn tone="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Btn>
        <span>Page {page} / {pages}</span>
        <Btn tone="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Btn>
      </div>
    </div>
  );
}
