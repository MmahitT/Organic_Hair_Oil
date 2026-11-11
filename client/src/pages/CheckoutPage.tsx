import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { CheckoutForm } from '@/components/shop/CheckoutForm';
import { CheckoutHeader } from '@/components/shop/CheckoutHeader';
import { ButtonLink } from '@/components/ui/Button';
import { useShop } from '@/hooks/useShop';
import { useCheckoutT, useT } from '@/hooks/useT';
import { useCart } from '@/store/cart';
import { useCatalog } from '@/store/catalog';

export default function CheckoutPage() {
  const c = useCheckoutT();
  const { t } = useT();
  const { status: catalogStatus } = useShop();
  const loadCatalog = useCatalog((s) => s.load);
  const lines = useCart((s) => s.lines);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  if (catalogStatus === 'idle' || catalogStatus === 'loading') return <p role="status" className="p-10 text-center text-charcoal-soft">{t.load.loading}</p>;

  return (
    <>
      <Helmet><title>{c.title} — Beauty Organic Hair Oil</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <CheckoutHeader title={c.title} />
      <main className="container-page py-6 pb-32 sm:py-10 lg:pb-12">
        <Link to="/" className="mb-4 inline-block text-sm font-semibold text-forest hover:underline">{c.back}</Link>

        {lines.length === 0 ? (
          <div className="mx-auto max-w-md rounded-xl2 bg-white p-8 text-center shadow-card">
            <h1 className="text-2xl font-bold">{c.emptyTitle}</h1>
            <p className="mt-2 text-charcoal-soft">{c.emptyText}</p>
            <ButtonLink className="mt-5" href="/#products">{c.shopNow}</ButtonLink>
          </div>
        ) : (
          <CheckoutForm />
        )}
      </main>
    </>
  );
}

