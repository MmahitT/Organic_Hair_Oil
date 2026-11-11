import react from '@vitejs/plugin-react';
import path from 'node:path';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { headersFile, securityHeaders } from './security-headers';

/** Public pages that belong in the sitemap. Private pages (checkout, order, track, admin) never do. */
const PUBLIC_PATHS = ['/', '/contact', '/privacy', '/terms', '/returns', '/shipping'];

/**
 * Build-time SEO files. They need the real public address, so they are produced only when VITE_SITE_URL is set
 * (e.g. https://www.example.com). robots.txt is always emitted; it blocks private areas either way.
 */
function seoFiles(site: string, headers: Record<string, string>): Plugin {
  return {
    name: 'seo-files',
    transformIndexHtml(html) {
      if (!site) return html;
      // Absolute canonical / og:url / og:image for crawlers that do not run JavaScript.
      return html.replace('</head>', `    <link rel="canonical" href="${site}/" data-rh="true" />\n    <meta property="og:url" content="${site}/" data-rh="true" />\n    <meta property="og:image" content="${site}/images/og-share.jpg" data-rh="true" />\n    <meta name="twitter:image" content="${site}/images/og-share.jpg" data-rh="true" />\n  </head>`);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(headers) });
      const lines = ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /checkout', 'Disallow: /order', 'Disallow: /track', 'Disallow: /api'];
      if (site) lines.push(`Sitemap: ${site}/sitemap.xml`);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${lines.join('\n')}\n` });
      if (site) {
        const today = new Date().toISOString().slice(0, 10);
        const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${site}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const site = (env['VITE_SITE_URL'] ?? '').replace(/\/$/, '');
  // If the API lives on another address (VITE_API_BASE_URL is absolute), the page must be allowed to call it.
  const apiBase = env['VITE_API_BASE_URL'] ?? '';
  const apiOrigin = /^https?:\/\//.test(apiBase) ? new URL(apiBase).origin : undefined;
  const headers = securityHeaders(apiOrigin);
  // Where /api is forwarded. Browser tests use a second API (other port, throwaway DB) so the normal dev stack can keep running.
  const apiTarget = process.env['API_PROXY'] ?? 'http://localhost:5001';
  return {
    plugins: [react(), seoFiles(site, headers)],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    // Same-origin API in dev and preview (no CORS, cookies work). Production: reverse-proxy /api or use an api. subdomain.
    server: { port: 5173, proxy: { '/api': apiTarget } },
    // `vite preview` sends the production security headers, so browser tests run under the real policy.
    preview: { port: 4173, proxy: { '/api': apiTarget }, headers },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  };
});
