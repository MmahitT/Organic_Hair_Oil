import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { _id: string; orderNo: string; status: string; paymentStatus: string; paymentMethod: string; total: number; createdAt: string; customer: { name: string; phone: string; district: string; city: string }; items: { name: string; quantity: number }[] };
const row = (orderNo: string, method: string): Row => ({ _id: orderNo, orderNo, status: 'pending', paymentStatus: 'pending', paymentMethod: method, total: 610, createdAt: '2026-11-11T05:00:00Z', customer: { name: 'Karim', phone: '01712345678', district: 'Rangpur', city: 'Mirpur' }, items: [{ name: 'Hair Oil', quantity: 1 }] });

const pending: { query: Record<string, string>; resolve: (v: unknown) => void }[] = [];
vi.mock('../auth', () => ({
  adminFetch: vi.fn((path: string, opts?: { query?: Record<string, string> }) => {
    if (path === '/admin/orders') return new Promise((resolve) => pending.push({ query: opts?.query ?? {}, resolve }));
    if (path === '/delivery/zones') return Promise.resolve({ data: { districts: ['Rangpur'] } });
    return Promise.resolve({ data: {} });
  }),
  downloadFile: vi.fn(),
  useAdminAuth: (sel: (s: { account: { role: string } }) => unknown) => sel({ account: { role: 'staff' } }),
}));

import OrdersPage from './OrdersPage';

beforeEach(() => { pending.length = 0; });

describe('Orders list — stale responses never overwrite newer ones', () => {
  it('shows the results of the LAST filter chosen even if an earlier request answers later', async () => {
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await waitFor(() => expect(pending.length).toBe(1)); // first load: all orders
    fireEvent.change(screen.getByLabelText('Filter by payment type'), { target: { value: 'cod' } });
    await waitFor(() => expect(pending.length).toBe(2)); // second request: COD only
    // the NEWER (COD) request answers first, then the OLDER (all orders) one answers late
    pending[1]!.resolve({ data: { items: [row('HO-COD-1', 'cod')] }, meta: { total: 1 } });
    await waitFor(() => expect(screen.getByText('HO-COD-1')).toBeTruthy());
    pending[0]!.resolve({ data: { items: [row('HO-COD-1', 'cod'), row('HO-BANK-9', 'manual_bank')] }, meta: { total: 2 } });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('HO-BANK-9')).toBeNull(); // the stale answer was ignored
    expect(screen.getByText('HO-COD-1')).toBeTruthy();
  });
});
