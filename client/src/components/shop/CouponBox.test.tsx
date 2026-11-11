import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CouponBox } from './CouponBox';

describe('CouponBox inside the checkout <form>', () => {
  it('applies the (upper-cased) code WITHOUT submitting the surrounding checkout form', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onApply = vi.fn();
    render(<form onSubmit={onSubmit}><CouponBox code={null} quote={null} loading={false} onApply={onApply} onRemove={() => {}} /></form>);
    const input = screen.getByLabelText('কুপন কোড');
    fireEvent.change(input, { target: { value: 'save10' } });
    fireEvent.click(screen.getByRole('button', { name: 'প্রয়োগ করুন' }));
    expect(onApply).toHaveBeenCalledWith('SAVE10');
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('pressing Enter applies the code and does not submit the checkout form', () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const onApply = vi.fn();
    render(<form onSubmit={onSubmit}><CouponBox code={null} quote={null} loading={false} onApply={onApply} onRemove={() => {}} /></form>);
    const input = screen.getByLabelText('কুপন কোড');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith('ABC');
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('shows the server reason for an invalid coupon', () => {
    const quote = { couponError: { reason: 'EXPIRED', message: 'x' }, coupon: null } as never;
    render(<CouponBox code="OLD" quote={quote} loading={false} onApply={() => {}} onRemove={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('মেয়াদ শেষ');
  });
});
