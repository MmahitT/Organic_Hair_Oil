import { describe, expect, it } from 'vitest';
import { normalizeBdPhone } from './phone';

describe('normalizeBdPhone', () => {
  it('normalises common formats', () => {
    expect(normalizeBdPhone('01712345678')).toBe('01712345678');
    expect(normalizeBdPhone('+8801712345678')).toBe('01712345678');
    expect(normalizeBdPhone('8801712345678')).toBe('01712345678');
    expect(normalizeBdPhone('017 1234-5678')).toBe('01712345678');
  });
  it('accepts Bangla digits', () => {
    expect(normalizeBdPhone('০১৭১২৩৪৫৬৭৮')).toBe('01712345678');
  });
  it('rejects invalid numbers', () => {
    for (const bad of ['', '12345', '01212345678', '0171234567', '017123456789', 'abcdefghijk', '+8801212345678']) expect(normalizeBdPhone(bad)).toBeNull();
  });
});
