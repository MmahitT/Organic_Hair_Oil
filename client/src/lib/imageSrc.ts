/** Local photos that are wider than 800 px (so they also have a full-size WebP worth offering to big screens). */
const WIDE = new Set(['lifestyle-products-bougainvillea', 'combo-box-packaging']);

/** Cloudinary delivery URLs get automatic format/quality + width; local /images/* get WebP copies in several sizes (srcset). */
export function imageSources(src: string, width?: number): { webp?: string; src: string } {
  if (src.includes('res.cloudinary.com') && src.includes('/upload/')) {
    const t = `f_auto,q_auto${width ? `,w_${width}` : ''}`;
    return { src: src.replace('/upload/', `/upload/${t}/`) };
  }
  if (/^\/images\/.+\.jpg$/.test(src)) {
    const base = src.replace(/\.jpg$/, '');
    const name = base.slice('/images/'.length);
    return { src, webp: `${base}-480.webp 480w, ${base}-800.webp 800w${WIDE.has(name) ? `, ${base}.webp 1100w` : ''}` };
  }
  return { src };
}
