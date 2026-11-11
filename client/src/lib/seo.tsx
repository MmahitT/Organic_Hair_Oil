import { Helmet } from 'react-helmet-async';

/** Public address of the site (set VITE_SITE_URL at build time for the real domain; the current origin is used otherwise). */
export const siteUrl = (): string => ((import.meta.env.VITE_SITE_URL as string | undefined) ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
export const absoluteUrl = (path: string): string => (/^https?:\/\//.test(path) ? path : `${siteUrl()}${path.startsWith('/') ? '' : '/'}${path}`);

/** JSON for a <script type="application/ld+json">. "<" is escaped so data can never close the script tag. */
export const jsonLdString = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

export interface SeoProps {
  title: string;
  description?: string;
  /** Path of this page (e.g. "/privacy"); makes the canonical and og:url. Omit for pages that should not be indexed. */
  path?: string;
  image?: string;
  noindex?: boolean;
  jsonLd?: unknown[];
  lang?: string;
}

/** Title, description, canonical, Open Graph / Twitter cards, robots and structured data for one page. */
export function Seo({ title, description, path, image, noindex, jsonLd = [], lang }: SeoProps) {
  const url = path !== undefined ? absoluteUrl(path) : undefined;
  const img = image ? absoluteUrl(image) : undefined;
  return (
    <Helmet>
      {lang && <html lang={lang} />}
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      <meta name="robots" content={noindex ? 'noindex,nofollow' : 'index,follow'} />
      {!noindex && url && <link rel="canonical" href={url} />}
      {!noindex && <meta property="og:type" content="website" />}
      {!noindex && <meta property="og:title" content={title} />}
      {!noindex && description && <meta property="og:description" content={description} />}
      {!noindex && url && <meta property="og:url" content={url} />}
      {!noindex && img && <meta property="og:image" content={img} />}
      {!noindex && <meta name="twitter:card" content={img ? 'summary_large_image' : 'summary'} />}
      {!noindex && <meta name="twitter:title" content={title} />}
      {!noindex && description && <meta name="twitter:description" content={description} />}
      {!noindex && img && <meta name="twitter:image" content={img} />}
      {!noindex && jsonLd.map((d, i) => <script key={i} type="application/ld+json">{jsonLdString(d)}</script>)}
    </Helmet>
  );
}
