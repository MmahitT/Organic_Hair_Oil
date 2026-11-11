import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCatalog } from '@/store/catalog';
import { useLangStore } from '@/store/lang';
import type { PublicSettings } from '@/types/api';
import { AnnouncementBar } from './AnnouncementBar';

const settings = (announcement: PublicSettings['announcement']): PublicSettings => ({ currency: 'BDT', business: { logo: null }, announcement, delivery: { zones: [] }, payments: { cod: true, manual: [], bank: null } });
beforeEach(() => { window.sessionStorage.clear(); });

describe('AnnouncementBar', () => {
  it('shows the owner’s message in the visitor’s language, falling back to the other language', () => {
    useCatalog.setState({ settings: settings({ text: 'Free delivery on combos', textBn: 'কম্বোতে ফ্রি ডেলিভারি', link: '#offer' }), products: [] });
    useLangStore.setState({ lang: 'bn' });
    const { unmount } = render(<AnnouncementBar />);
    expect(screen.getByText('কম্বোতে ফ্রি ডেলিভারি')).toBeTruthy();
    unmount();
    useCatalog.setState({ settings: settings({ text: 'English only', link: null }), products: [] });
    render(<AnnouncementBar />);
    expect(screen.getByText('English only')).toBeTruthy(); // no Bangla text → English shown
  });
  it('renders nothing when there is no announcement', () => {
    useCatalog.setState({ settings: settings(null), products: [] });
    const { container } = render(<AnnouncementBar />);
    expect(container.textContent).toBe('');
  });
});
