import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { CookieBanner } from '@/components/layout/CookieBanner';
import { useAnalytics } from '@/hooks/useAnalytics';
import HomePage from '@/pages/HomePage';
import NotFoundPage from '@/pages/NotFoundPage';

// Admin lives in its own chunk so storefront visitors never download it.
const AdminApp = lazy(() => import('@/admin/AdminApp'));
const CheckoutPage = lazy(() => import('@/pages/CheckoutPage'));
const OrderPage = lazy(() => import('@/pages/OrderPage'));
const TrackPage = lazy(() => import('@/pages/TrackPage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const LegalPage = lazy(() => import('@/pages/LegalPage'));
const Loading = <p role="status" className="p-8 text-center text-charcoal-soft">Loading…</p>;

export default function App() {
  useAnalytics();
  const admin = useLocation().pathname.startsWith('/admin');
  return (
    <>
    {!admin && <CookieBanner />}
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/checkout" element={<Suspense fallback={Loading}><CheckoutPage /></Suspense>} />
      <Route path="/order/:orderNo" element={<Suspense fallback={Loading}><OrderPage /></Suspense>} />
      <Route path="/track" element={<Suspense fallback={Loading}><TrackPage /></Suspense>} />
      <Route path="/contact" element={<Suspense fallback={Loading}><ContactPage /></Suspense>} />
      <Route path="/admin/*" element={<Suspense fallback={Loading}><AdminApp /></Suspense>} />
      <Route path="*" element={<NotFoundPage />} />
      <Route path="/privacy" element={<Suspense fallback={Loading}><LegalPage slug="privacy" /></Suspense>} />
      <Route path="/terms" element={<Suspense fallback={Loading}><LegalPage slug="terms" /></Suspense>} />
      <Route path="/returns" element={<Suspense fallback={Loading}><LegalPage slug="refund" /></Suspense>} />
      <Route path="/shipping" element={<Suspense fallback={Loading}><LegalPage slug="shipping" /></Suspense>} />
    </Routes>
    </>
  );
}
