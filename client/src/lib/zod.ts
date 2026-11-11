import { z } from 'zod';

// Zod 4 normally compiles validators with `new Function` for speed. That needs 'unsafe-eval', which the site's Content
// Security Policy deliberately forbids (the browser blocks the attempt and reports a violation). Forms are tiny, so
// the plain interpreter is plenty fast — and the site needs no eval at all.
z.config({ jitless: true });

export { z };
