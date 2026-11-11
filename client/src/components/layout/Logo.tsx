import logo from '@/assets/logo-mark.png';
import { cn } from '@/lib/cn';

export function Logo({ light, className }: { light?: boolean; className?: string }) {
  return (
    <a href="#top" className={cn('flex items-center gap-2.5', className)}>
      <img src={logo} alt="" width={40} height={36} className={cn('h-9 w-auto', light && 'brightness-0 invert')} />
      <span className={cn('font-heading text-lg font-bold leading-none', light ? 'text-cream' : 'text-forest')}>
        Beauty Organic
        <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gold-dark">{light ? <span className="text-gold-soft">Hair Oil</span> : 'Hair Oil'}</span>
      </span>
    </a>
  );
}
