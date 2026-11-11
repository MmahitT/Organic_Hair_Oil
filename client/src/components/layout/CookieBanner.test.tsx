import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalog } from '@/store/catalog';
import { useConsent } from '@/store/consent';
import { useLangStore } from '@/store/lang';
import type { PublicSettings } from '@/types/api';
import { CookieBanner } from './CookieBanner';

const settings = (analytics: PublicSettings['analytics']): PublicSettings => ({ currency: 'BDT', business: { logo: null }, announcement: null, delivery: { zones: [] }, payments: { cod: true, manual: [], bank: null }, analytics });
const setup = () => render(<MemoryRouter><CookieBanner /></MemoryRouter>);
const stored = () => JSON.parse(window.localStorage.getItem('bo-consent-v1') ?? 'null');
beforeEach(() => { window.localStorage.clear(); useConsent.setState({ consent: null, panelOpen: false }); useLangStore.setState({ lang: 'en' }); });

describe('cookie banner', () => {
  it('does not appear when the owner has not configured any tracking', () => {
    useCatalog.setState({ settings: settings({ ga4Id: null, metaPixelId: null }) });
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('asks first, and "Reject all" is as easy as "Accept all" and is remembered', () => {
    useCatalog.setState({ settings: settings({ ga4Id: 'G-ABC123XYZ9', metaPixelId: '123456789012' }) });
    setup();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(stored()).toBeNull(); // nothing is stored (or tracked) before a choice
    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));
    expect(stored()).toMatchObject({ analytics: false, marketing: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('accept all only enables the tools that are actually configured', () => {
    useCatalog.setState({ settings: settings({ ga4Id: 'G-ABC123XYZ9', metaPixelId: null }) });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(stored()).toMatchObject({ analytics: true, marketing: false });
  });
  it('lets the visitor choose per tool, and reopen the panel later to change their mind', () => {
    useCatalog.setState({ settings: settings({ ga4Id: 'G-ABC123XYZ9', metaPixelId: '123456789012' }) });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    fireEvent.click(screen.getByLabelText(/Analytics/));
    fireEvent.click(screen.getByRole('button', { name: 'Save my choices' }));
    expect(stored()).toMatchObject({ analytics: true, marketing: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useConsent.getState().openPanel()); // the footer "Cookie settings" link
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText(/Analytics/) as HTMLInputElement).checked).toBe(true); // shows the saved choice
    fireEvent.click(screen.getByLabelText(/Analytics/));
    fireEvent.click(screen.getByRole('button', { name: 'Save my choices' }));
    expect(stored()).toMatchObject({ analytics: false, marketing: false });
  });
  it('is not shown again once a choice exists', () => {
    useConsent.getState().decide({ analytics: false, marketing: false });
    useCatalog.setState({ settings: settings({ ga4Id: 'G-ABC123XYZ9', metaPixelId: null }) });
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
