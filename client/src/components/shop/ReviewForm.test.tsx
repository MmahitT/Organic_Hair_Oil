import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReviewForm } from './ReviewForm';

afterEach(() => vi.unstubAllGlobals());
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

describe('ReviewForm', () => {
  it('asks for a rating and a few words before sending anything', () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    render(<ReviewForm orderNo="HO-261111-ABCDE" phone="01712345678" productId="p1" name="Hair Oil" />);
    fireEvent.click(screen.getByRole('button', { name: 'রিভিউ জমা দিন' }));
    expect(screen.getByText('অনুগ্রহ করে একটি রেটিং বেছে নিন।')).toBeTruthy();
    expect(screen.getByText(/কমপক্ষে ৫ অক্ষর/)).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
  it('sends the verified-buyer details and shows the approval note', async () => {
    const f = vi.fn().mockResolvedValue(json(201, { success: true, data: { id: 'r1', status: 'pending' } })); vi.stubGlobal('fetch', f);
    render(<ReviewForm orderNo="HO-261111-ABCDE" phone="01712345678" productId="p1" name="Hair Oil" />);
    fireEvent.click(screen.getByRole('radio', { name: /মধ্যে ৪/ }));
    fireEvent.change(screen.getByLabelText(/আপনার রিভিউ/), { target: { value: 'Very nice smell and texture' } });
    fireEvent.click(screen.getByRole('button', { name: 'রিভিউ জমা দিন' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('অনুমোদন'));
    const [url, init] = f.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('/reviews');
    expect(JSON.parse(init.body)).toEqual({ orderNo: 'HO-261111-ABCDE', phone: '01712345678', productId: 'p1', rating: 4, comment: 'Very nice smell and texture' });
  });
  it('treats "already reviewed" as done instead of an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { success: false, error: { code: 'REVIEW_EXISTS', message: 'dup' } })));
    render(<ReviewForm orderNo="HO-261111-ABCDE" phone="01712345678" productId="p1" name="Hair Oil" />);
    fireEvent.click(screen.getByRole('radio', { name: /মধ্যে ৫/ }));
    fireEvent.change(screen.getByLabelText(/আপনার রিভিউ/), { target: { value: 'Lovely product indeed' } });
    fireEvent.click(screen.getByRole('button', { name: 'রিভিউ জমা দিন' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
  });
});
