/** Normalises Bangladeshi mobile numbers to the local 01XXXXXXXXX format. Returns null if invalid. */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '');
  const m = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(digits);
  return m?.[1] ?? null;
}

export const BD_PHONE_REGEX = /^01[3-9]\d{8}$/;
