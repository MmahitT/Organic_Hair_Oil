import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'gold' | 'outline' | 'ghost' | 'light';
type Size = 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-forest text-white hover:bg-forest-700 shadow-soft',
  gold: 'bg-gold text-charcoal hover:bg-[#D3B47C] shadow-soft',
  outline: 'border-2 border-forest text-forest hover:bg-forest hover:text-white',
  ghost: 'text-forest hover:bg-sage-light',
  light: 'bg-white text-forest hover:bg-cream-dark',
};
const sizes: Record<Size, string> = { md: 'min-h-11 px-5 text-sm', lg: 'min-h-12 px-7 text-base' };

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50';

interface Common { variant?: Variant; size?: Size; full?: boolean; children: ReactNode; className?: string }

export function Button({ variant = 'primary', size = 'md', full, className, children, ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(base, variants[variant], sizes[size], full && 'w-full', className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', size = 'md', full, className, children, ...rest }: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cn(base, variants[variant], sizes[size], full && 'w-full', className)} {...rest}>
      {children}
    </a>
  );
}
