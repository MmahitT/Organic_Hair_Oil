import { Menu, ShoppingBag, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useOrderNow } from '@/hooks/useOrderNow';
import { useT } from '@/hooks/useT';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { useCart } from '@/store/cart';
import { LangToggle } from './LangToggle';
import { Logo } from './Logo';

export function Navbar() {
  const { t, lang } = useT();
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const count = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const openCart = useCart((s) => s.open);
  const { featured, orderNow: order } = useOrderNow();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    ...(featured ? ([['#offer', t.nav.offer]] as const) : []), ['#benefits', t.nav.benefits], ['#ingredients', t.nav.ingredients],
    ['#how-to-use', t.nav.howTo], ['#reviews', t.nav.reviews], ['#faq', t.nav.faq],
  ] as const;

  const orderNow = () => { order(); setMenu(false); };

  return (
    <header className={cn('sticky top-0 z-40 border-b transition-all', scrolled ? 'border-sage/40 bg-cream/90 backdrop-blur shadow-card' : 'border-transparent bg-cream')}>
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          {links.map(([href, label]) => (
            <a key={href} href={href} className="text-sm font-medium text-charcoal hover:text-forest">{label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LangToggle />
          <button type="button" onClick={openCart} aria-label={t.nav.cart} className="relative flex h-11 w-11 items-center justify-center rounded-full text-forest hover:bg-sage-light">
            <ShoppingBag aria-hidden className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[0.7rem] font-bold text-charcoal">{formatNumber(count, lang)}</span>
            )}
          </button>
          <Button className="hidden lg:inline-flex" onClick={orderNow}>{t.nav.orderNow}</Button>
          <button type="button" aria-label={menu ? t.nav.close : t.nav.menu} aria-expanded={menu} aria-controls="mobile-menu" onClick={() => setMenu((m) => !m)} className="flex h-11 w-11 items-center justify-center rounded-full text-forest hover:bg-sage-light lg:hidden">
            {menu ? <X aria-hidden className="h-5 w-5" /> : <Menu aria-hidden className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {menu && (
        <nav id="mobile-menu" aria-label="Mobile" className="border-t border-sage/40 bg-cream lg:hidden">
          <ul className="container-page flex flex-col py-2">
            {links.map(([href, label]) => (
              <li key={href}>
                <a href={href} onClick={() => setMenu(false)} className="flex min-h-12 items-center text-base font-medium text-charcoal">{label}</a>
              </li>
            ))}
            <li className="py-3"><Button full onClick={orderNow}>{t.nav.orderNow}</Button></li>
          </ul>
        </nav>
      )}
    </header>
  );
}
