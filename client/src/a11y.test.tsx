import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CookieBanner } from '@/components/layout/CookieBanner';
import { CouponBox } from '@/components/shop/CouponBox';
import { PaymentPanel } from '@/components/shop/PaymentPanel';
import { ReviewForm } from '@/components/shop/ReviewForm';
import ContactPage from '@/pages/ContactPage';
import LegalPage from '@/pages/LegalPage';
import TrackPage from '@/pages/TrackPage';
import { useCatalog } from '@/store/catalog';
import { useConsent } from '@/store/consent';
import { useLangStore } from '@/store/lang';
import type { OrderStatusData, PublicSettings } from '@/types/api';

expect.extend(toHaveNoViolations);
window.scrollTo = vi.fn() as never;
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const wrap = (ui: React.ReactElement) => <HelmetProvider><MemoryRouter>{ui}</MemoryRouter></HelmetProvider>;
const settings = (analytics: PublicSettings['analytics'] = { ga4Id: 'G-ABC123XYZ9', metaPixelId: '123456789012' }): PublicSettings => ({ currency: 'BDT', business: { logo: null, name: 'Shop', email: 'a@b.com' }, announcement: null, delivery: { zones: [] }, payments: { cod: true, manual: [], bank: null }, analytics });
/** Runs axe on the rendered DOM. (Colour contrast needs a real browser — Lighthouse covers it, see TESTING.md.) */
const check = async (container: HTMLElement) => expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations();

beforeEach(() => { window.localStorage.clear(); useConsent.setState({ consent: null, panelOpen: false }); useCatalog.setState({ settings: settings(), products: [] }); });
afterEach(() => vi.unstubAllGlobals());

describe('accessibility (axe) — English and Bangla', () => {
  for (const lang of ['en', 'bn'] as const) {
    describe(lang, () => {
      beforeEach(() => useLangStore.setState({ lang }));

      it('cookie banner — summary and the detailed panel', async () => {
        const { container } = render(wrap(<CookieBanner />));
        await check(container);
        fireEvent.click(screen.getAllByRole('button')[0]!); // "Choose" → detailed panel with checkboxes
        await check(container);
      });
      it('contact form — empty and with validation errors', async () => {
        const { container } = render(wrap(<ContactPage />));
        await check(container);
        fireEvent.click(screen.getByRole('button', { name: /বার্তা পাঠান|Send message/ }));
        await check(container);
      });
      it('legal page rendered from Markdown (draft notice, headings, lists, links)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { success: true, data: { slug: 'privacy', title: 'Privacy Policy', reviewed: false, isTemplate: true, markdown: '# Privacy Policy\n\n## What we collect\n- Order details\n- Messages\n\nWrite to [us](mailto:a@b.com).' } })));
        const { container } = render(wrap(<LegalPage slug="privacy" />));
        await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeTruthy());
        await check(container);
      });
      it('order tracking form', async () => {
        const { container } = render(wrap(<TrackPage />));
        await check(container);
      });
      it('review form (rating radio group, textarea, errors)', async () => {
        const { container } = render(<ReviewForm orderNo="HO-261111-ABCDE" phone="01712345678" productId="p1" name="Hair Oil" />);
        await check(container);
        fireEvent.click(screen.getByRole('button', { name: /রিভিউ জমা দিন|Submit review/ }));
        await check(container);
      });
      it('coupon box (idle, error)', async () => {
        const quote = { couponError: { reason: 'EXPIRED', message: 'x' }, coupon: null } as never;
        const { container } = render(<CouponBox code="OLD" quote={quote} loading={false} onApply={() => {}} onRemove={() => {}} />);
        await check(container);
      });
      it('payment panel — bank transfer and mobile money instructions + claim form', async () => {
        const base = (manual: NonNullable<OrderStatusData['payment']['manual']>, method: string): OrderStatusData => ({ orderNo: 'HO-261111-ABCDE', status: 'pending', paymentStatus: 'initiated', paymentMethod: method, createdAt: '2026-11-11T05:00:00Z', items: [], subtotal: 550, productDiscount: 0, couponDiscount: 0, deliveryFee: 60, total: 610, deliveryZone: null, customer: { firstName: 'R', phoneMasked: '017*****678', district: 'Rangpur' }, payment: { method, status: 'initiated', expiresAt: null, manual } });
        const bank = base({ channel: 'bank', number: null, instructions: 'Use the order number as reference.', bank: { bankName: 'Example Bank', accountName: 'Test', accountNumber: '1234', branch: null }, canSubmit: true, submitted: false }, 'manual_bank');
        const bk = base({ channel: 'bkash', number: '01700000099', instructions: null, bank: null, canSubmit: true, submitted: false }, 'manual_bkash');
        for (const o of [bank, bk]) { const { container, unmount } = render(<PaymentPanel order={o} token={'t'.repeat(40)} onChanged={() => {}} />); await check(container); unmount(); }
      });
    });
  }

  it('the cookie settings panel can be reopened from the footer link and is still accessible', async () => {
    useLangStore.setState({ lang: 'en' });
    useConsent.getState().decide({ analytics: false, marketing: false });
    const { container } = render(wrap(<CookieBanner />));
    act(() => useConsent.getState().openPanel());
    expect(screen.getByRole('dialog')).toBeTruthy();
    await check(container);
  });
});
