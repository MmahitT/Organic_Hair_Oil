import { describe, expect, it } from 'vitest';
import { imageSources } from './imageSrc';

describe('imageSources', () => {
  it('adds Cloudinary auto format/quality and width', () => {
    expect(imageSources('https://res.cloudinary.com/demo/image/upload/v1/beauty/p.jpg', 600).src).toBe('https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_600/v1/beauty/p.jpg');
  });
  it('offers responsive WebP sizes for local jpgs and leaves other URLs alone', () => {
    expect(imageSources('/images/a.jpg')).toEqual({ src: '/images/a.jpg', webp: '/images/a-480.webp 480w, /images/a-800.webp 800w' });
    expect(imageSources('/images/combo-box-packaging.jpg').webp).toBe('/images/combo-box-packaging-480.webp 480w, /images/combo-box-packaging-800.webp 800w, /images/combo-box-packaging.webp 1100w');
    expect(imageSources('https://example.com/x.png')).toEqual({ src: 'https://example.com/x.png' });
  });
});
