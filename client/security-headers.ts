/**
 * Security headers for the website (the API sets its own with Helmet). One source of truth:
 *  - `vite preview` serves them, so browser tests run under the real policy;
 *  - the build writes dist/_headers (Netlify / Cloudflare Pages format) so the host can apply the same policy.
 * Production hosting must send these headers on every page (Phase 11). HSTS is added by the host over HTTPS.
 *
 * Why each source is allowed:
 *  - Google Analytics / Meta Pixel scripts and beacons — only loaded after the visitor consents;
 *  - fonts.googleapis.com / fonts.gstatic.com — web fonts;
 *  - res.cloudinary.com — product photos;
 *  - 'unsafe-inline' for STYLES only — React/Framer Motion set style attributes; scripts never get 'unsafe-inline'.
 */
export function securityHeaders(apiOrigin?: string): Record<string, string> {
  const api = apiOrigin ? ` ${apiOrigin}` : '';
  const google = 'https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com';
  const meta = 'https://connect.facebook.net https://www.facebook.com https://*.facebook.com';
  const csp = [
    "default-src 'self'",
    `script-src 'self' https://www.googletagmanager.com https://connect.facebook.net`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src 'self' data: blob: https://res.cloudinary.com ${google} ${meta}`,
    `connect-src 'self'${api} ${google} ${meta}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  };
}

export const headersFile = (h: Record<string, string>) => `/*\n${Object.entries(h).map(([k, v]) => `  ${k}: ${v}`).join('\n')}\n`;
