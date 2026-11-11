import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ContactPage from './ContactPage';

afterEach(() => vi.unstubAllGlobals());
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const setup = () => render(<HelmetProvider><MemoryRouter><ContactPage /></MemoryRouter></HelmetProvider>);
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('ContactPage', () => {
  it('asks for a way to reply and does not call the server until the form is valid', () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    setup();
    type(/আপনার নাম/, 'Rahim Uddin'); type(/আপনার বার্তা/, 'Is the oil safe for kids?');
    fireEvent.click(screen.getByRole('button', { name: 'বার্তা পাঠান' }));
    expect(screen.getByText('উত্তর দিতে একটি ফোন নম্বর বা ইমেইল দিন।')).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });
  it('sends a valid message (phone normalised, honeypot empty) and thanks the customer', async () => {
    const f = vi.fn().mockResolvedValue(json(201, { success: true, data: { received: true } })); vi.stubGlobal('fetch', f);
    setup();
    type(/আপনার নাম/, 'Rahim Uddin'); type(/মোবাইল নম্বর/, '+8801712345678'); type(/আপনার বার্তা/, 'Is the oil safe for kids?');
    fireEvent.click(screen.getByRole('button', { name: 'বার্তা পাঠান' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('ধন্যবাদ'));
    const sent = JSON.parse((f.mock.calls[0] as [string, { body: string }])[1].body);
    expect(sent).toEqual({ name: 'Rahim Uddin', phone: '01712345678', message: 'Is the oil safe for kids?', website: '' });
  });
  it('shows a friendly message when sending is rate limited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(429, { success: false, error: { code: 'RATE_LIMITED', message: 'x' } })));
    setup();
    type(/আপনার নাম/, 'Rahim Uddin'); type(/ইমেইল/, 'r@example.com'); type(/আপনার বার্তা/, 'Hello there friends');
    fireEvent.click(screen.getByRole('button', { name: 'বার্তা পাঠান' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('অনেকগুলো বার্তা'));
  });
});
