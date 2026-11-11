import crypto from 'node:crypto';

// No 0/O/1/I/L to avoid read-aloud / handwriting mistakes when customers quote their order number.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** HO-YYMMDD-XXXXX (Asia/Dhaka date). Uniqueness is enforced by the unique index; callers pre-check and retry. */
export function generateOrderNo(now = new Date()): string {
  const dhaka = new Date(now.getTime() + 6 * 3600_000); // UTC+6, no DST
  const yy = String(dhaka.getUTCFullYear()).slice(2);
  const mm = String(dhaka.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dhaka.getUTCDate()).padStart(2, '0');
  let suffix = '';
  for (const b of crypto.randomBytes(5)) suffix += ALPHABET[b % ALPHABET.length];
  return `HO-${yy}${mm}${dd}-${suffix}`;
}
