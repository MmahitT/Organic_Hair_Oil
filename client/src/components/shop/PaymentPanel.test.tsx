import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrderStatusData } from '@/types/api';
import { PaymentPanel } from './PaymentPanel';

afterEach(() => vi.unstubAllGlobals());
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const order = (manual: NonNullable<OrderStatusData['payment']['manual']>, status = 'initiated', method = manual.channel === 'bank' ? 'manual_bank' : 'manual_bkash'): OrderStatusData => ({
  orderNo: 'HO-261111-ABCDE', status: 'pending', paymentStatus: status, paymentMethod: method, createdAt: '2026-11-11T05:00:00Z', items: [], subtotal: 550, productDiscount: 0, couponDiscount: 0, deliveryFee: 60, total: 610, deliveryZone: null,
  customer: { firstName: 'R', phoneMasked: '017*****678', district: 'Rangpur' },
  payment: { method, status, expiresAt: null, manual },
});
const BANK = { channel: 'bank' as const, number: null, instructions: 'Write your order number as the reference.', bank: { bankName: 'Example Bank', accountName: 'Test Business', accountNumber: '1234-567-890', branch: 'Dhanmondi' }, canSubmit: true, submitted: false };
const BKASH = { channel: 'bkash' as const, number: '01700000099', instructions: 'Use Send Money.', bank: null, canSubmit: true, submitted: false };

describe('PaymentPanel — manual payments', () => {
  it('shows the bank account details and instructions, and needs no sender phone number', async () => {
    const f = vi.fn().mockResolvedValue(json(200, { success: true, data: { submitted: true } })); vi.stubGlobal('fetch', f);
    const changed = vi.fn();
    render(<PaymentPanel order={order(BANK)} token={'t'.repeat(40)} onChanged={changed} />);
    expect(screen.getByTestId('merchant-bank').textContent).toContain('1234-567-890');
    expect(screen.getByText('Write your order number as the reference.')).toBeTruthy();
    expect(screen.getByText(/স্ক্রিনশট বা ট্রানজেকশন আইডি দিয়ে নিশ্চিত হয় না/)).toBeTruthy(); // a claim alone never confirms
    fireEvent.click(screen.getByRole('button', { name: 'পেমেন্টের তথ্য জমা দিন' }));
    expect(f).not.toHaveBeenCalled(); // missing transaction id
    fireEvent.change(screen.getByLabelText(/ট্রানজেকশন আইডি/), { target: { value: 'trf-2026-42' } });
    fireEvent.change(screen.getByLabelText(/পেমেন্টের রেফারেন্স/), { target: { value: 'City Bank ac 4411' } });
    fireEvent.click(screen.getByRole('button', { name: 'পেমেন্টের তথ্য জমা দিন' }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    const sent = JSON.parse((f.mock.calls[0] as [string, { body: string }])[1].body);
    expect(sent).toEqual({ orderNo: 'HO-261111-ABCDE', token: 't'.repeat(40), trxId: 'TRF-2026-42', reference: 'City Bank ac 4411' });
  });
  it('mobile money still requires the number the money was sent from', () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    render(<PaymentPanel order={order(BKASH)} token={'t'.repeat(40)} onChanged={() => {}} />);
    expect(screen.getByTestId('merchant-number').textContent).toBe('01700000099');
    fireEvent.change(screen.getByLabelText(/ট্রানজেকশন আইডি/), { target: { value: '8N7A6D5E4C' } });
    fireEvent.click(screen.getByRole('button', { name: 'পেমেন্টের তথ্য জমা দিন' }));
    expect(screen.getByText('সঠিক বাংলাদেশি মোবাইল নম্বর দিন।')).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
  it('after submitting it says the order stays pending until verified; refunds are shown plainly', () => {
    const { unmount } = render(<PaymentPanel order={order({ ...BANK, submitted: true }, 'pending')} token={'t'.repeat(40)} onChanged={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('যাচাই না হওয়া পর্যন্ত');
    unmount();
    render(<PaymentPanel order={order(BANK, 'refunded')} token={'t'.repeat(40)} onChanged={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('ফেরত দেওয়া হয়েছে');
  });
});
