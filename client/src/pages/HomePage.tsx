import { useEffect, useRef } from 'react';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { CartDrawer } from '@/components/layout/CartDrawer';
import { FloatingActions } from '@/components/layout/FloatingActions';
import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/Button';
import { track, itemsFor } from '@/lib/analytics';
import { Seo } from '@/lib/seo';
import { faqLd, organizationLd, productsLd } from '@/lib/structuredData';
import { useShop } from '@/hooks/useShop';
import { useT } from '@/hooks/useT';
import logo from '@/assets/logo-mark.png';
import { Benefits } from '@/sections/Benefits';
import { Faq } from '@/sections/Faq';
import { FinalCta } from '@/sections/FinalCta';
import { Gallery } from '@/sections/Gallery';
import { Hero } from '@/sections/Hero';
import { HowToUse } from '@/sections/HowToUse';
import { Ingredients } from '@/sections/Ingredients';
import { Offers } from '@/sections/Offers';
import { OrderSection } from '@/sections/OrderSection';
import { ProductIntro } from '@/sections/ProductIntro';
import { Reviews } from '@/sections/Reviews';
import { TrustIndicators } from '@/sections/TrustIndicators';
import { useCart } from '@/store/cart';
import { useCatalog } from '@/store/catalog';

function Splash() {
  const { t } = useT();
  const status = useCatalog((s) => s.status);
  const load = useCatalog((s) => s.load);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <img src={logo} alt="" className="h-16 w-auto animate-pulse" width={64} height={57} />
      {status === 'error' ? (
        <>
          <h1 className="text-2xl font-bold">{t.load.errorTitle}</h1>
          <p className="max-w-sm text-charcoal-soft">{t.load.errorText}</p>
          <Button onClick={() => void load()}>{t.load.retry}</Button>
        </>
      ) : (
        <p role="status" className="text-charcoal-soft">{t.load.loading}</p>
      )}
    </main>
  );
}

export default function HomePage() {
  const { t, f, lang } = useT();
  const { status, products } = useShop();
  const load = useCatalog((s) => s.load);
  const reconcile = useCart((s) => s.reconcile);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (status === 'ready') reconcile(products); }, [status, products, reconcile]);

  const settings = useCatalog((s) => s.settings);
  const seo = settings?.seo;
  const fallbackTitle = lang === 'bn' ? 'বিউটি অর্গানিক হেয়ার অয়েল — হেয়ার অয়েল ও পাউডার কম্বো' : 'Beauty Organic Hair Oil — Hair Oil & Powder Combo';
  const seoTitle = (lang === 'bn' ? seo?.titleBn ?? seo?.title : seo?.title ?? seo?.titleBn) ?? fallbackTitle;
  const seoDesc = (lang === 'bn' ? seo?.descriptionBn ?? seo?.description : seo?.description ?? seo?.descriptionBn) ?? f(t.hero.sub);
  const faqItems = (settings?.faq ?? []).length
    ? (settings?.faq ?? []).map((i) => ({ q: lang === 'bn' ? i.qBn ?? i.q : i.q, a: lang === 'bn' ? i.aBn ?? i.a : i.a }))
    : t.faq.items.map((i) => ({ q: i.q, a: f(i.a) }));
  const jsonLd = [organizationLd(settings), ...productsLd(products, settings?.business.name ?? 'Beauty Organic Hair Oil', lang), faqLd(faqItems)].filter(Boolean);
  const viewed = useRef(false);
  useEffect(() => {
    // one "view item" for the main offer per visit (only counts if the visitor accepted tracking)
    if (status === 'ready' && !viewed.current && products.length) { viewed.current = true; const p = products.find((x) => x.isFeatured) ?? products[0]!; track('view_item', { items: itemsFor([{ productId: p.id, sku: p.variants[0]?.sku ?? '', qty: 1 }]) }); }
  }, [status, products]);

  if (status !== 'ready') return <Splash />;
  return (
    <>
      <Seo title={seoTitle} description={seoDesc} path="/" image={seo?.ogImage ?? '/images/og-share.jpg'} lang={lang} jsonLd={jsonLd} />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-3">{t.a11y.skip}</a>
      <AnnouncementBar />
      <Navbar />
      <main id="main">
        <Hero />
        <TrustIndicators />
        <ProductIntro />
        <Benefits />
        <Ingredients />
        <HowToUse />
        <Gallery />
        <Reviews />
        <Offers />
        <OrderSection />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <CartDrawer />
      <FloatingActions />
    </>
  );
}
