/** Mirrors the server: Bangladeshi mobile numbers normalised to 01XXXXXXXXX, or null if invalid. Accepts Bangla digits. */
export function normalizeBdPhone(input: string): string | null {
  const ascii = input.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  const digits = ascii.replace(/[\s\-()]/g, '');
  const m = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(digits);
  return m?.[1] ?? null;
}
