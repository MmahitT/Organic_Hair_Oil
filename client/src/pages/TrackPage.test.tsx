import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TrackPage from './TrackPage';

afterEach(() => vi.unstubAllGlobals());
window.scrollTo = vi.fn() as never; // jsdom does not implement it
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const tracked = {
  orderNo: 'HO-261111-ABCDE', status: 'shipped', paymentStatus: 'cod_pending', paymentMethod: 'cod', createdAt: '2026-11-11T05:00:00Z', token: 't'.repeat(40),
  timeline: [{ status: 'pending', at: '2026-11-11T05:00:00Z' }, { status: 'confirmed', at: '2026-11-11T06:00:00Z' }, { status: 'shipped', at: '2026-11-11T07:00:00Z' }],
  items: [{ productId: 'p1', name: 'Hair Oil', image: null, unitPrice: 550, quantity: 1, lineTotal: 550 }],
  subtotal: 550, productDiscount: 0, couponDiscount: 0, deliveryFee: 60, total: 610, deliveryZone: 'Inside Rangpur', courier: { name: 'Steadfast', trackingNo: 'TRK1' },
  customer: { firstName: 'Rahim', phoneMasked: '017*****678', district: 'Rangpur' }, canCancel: false, cancellationRequested: false, canReturn: false, returnStatus: null,
};
const setup = () => render(<HelmetProvider><MemoryRouter><TrackPage /></MemoryRouter></HelmetProvider>);
const fill = (no: string, phone: string) => {
  fireEvent.change(screen.getByLabelText(/অর্ডার নম্বর/), { target: { value: no } });
  fireEvent.change(screen.getByLabelText(/মোবাইল নম্বর/), { target: { value: phone } });
  fireEvent.click(screen.getByRole('button', { name: 'ট্র্যাক করুন' }));
};

describe('TrackPage', () => {
  it('does not call the server for malformed input', () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    setup(); fill('abc', '123');
    expect(f).not.toHaveBeenCalled();
    expect(screen.getAllByText(/পাওয়া যায়নি|মোবাইল নম্বর/).length).toBeGreaterThan(0);
  });
  it('shows one generic message when the order or phone is wrong', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(404, { success: false, error: { code: 'ORDER_NOT_FOUND', message: 'x' } })));
    setup(); fill('HO-261111-ABCDE', '01712345678');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('কোনো অর্ডার পাওয়া যায়নি'));
  });
  it('shows the status timeline, courier and invoice link without any address', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { success: true, data: tracked })); vi.stubGlobal('fetch', f);
    setup(); fill('ho-261111-abcde', '01712345678');
    await waitFor(() => expect(screen.getByTestId('track-status').textContent).toContain('পাঠানো হয়েছে'));
    const sent = JSON.parse((f.mock.calls[0] as [string, { body: string }])[1].body);
    expect(sent).toEqual({ orderNo: 'HO-261111-ABCDE', phone: '01712345678' });
    expect(screen.getByText('Steadfast')).toBeTruthy();
    expect(screen.getByRole('link', { name: /ইনভয়েস/ }).getAttribute('href')).toContain('/orders/HO-261111-ABCDE/invoice?token=');
    expect(document.body.textContent).not.toMatch(/House|Mirpur/);
    expect(screen.queryByRole('button', { name: 'অর্ডার বাতিল করুন' })).toBeNull(); // shipped: no cancel
  });
  it('offers cancellation only while the server says it is allowed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { success: true, data: { ...tracked, status: 'pending', timeline: tracked.timeline.slice(0, 1), canCancel: true } })));
    setup(); fill('HO-261111-ABCDE', '01712345678');
    await waitFor(() => expect(screen.getByRole('button', { name: 'অর্ডার বাতিল করুন' })).toBeTruthy());
  });
});
