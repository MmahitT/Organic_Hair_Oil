import { Link } from 'react-router-dom';
import logo from '@/assets/logo-mark.png';
import { LangToggle } from '@/components/layout/LangToggle';
import { useShop } from '@/hooks/useShop';

/** Distraction-free header for checkout and confirmation pages. */
export function CheckoutHeader({ title }: { title: string }) {
  const { businessName } = useShop();
  return (
    <header className="border-b border-sage/40 bg-cream">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5" aria-label={businessName}>
          <img src={logo} alt="" width={40} height={36} className="h-9 w-auto" />
          <span className="font-heading text-lg font-bold leading-none text-forest">{title}</span>
        </Link>
        <LangToggle />
      </div>
    </header>
  );
}
