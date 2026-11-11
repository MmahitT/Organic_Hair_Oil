import { Check, Tag, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { useCheckoutT } from '@/hooks/useT';
import type { Quote } from '@/types/api';

interface Props { code: string | null; quote: Quote | null; loading: boolean; onApply: (code: string) => void; onRemove: () => void }

/** Coupon entry. Validity and the discount always come from the server quote. */
export function CouponBox({ code, quote, loading, onApply, onRemove }: Props) {
  const c = useCheckoutT();
  const [draft, setDraft] = useState('');
  const applied = quote?.coupon;
  const error = quote?.couponError;

  if (code && (applied || error || loading)) {
    return (
      <div className="space-y-1.5" aria-live="polite">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-sage bg-sage-light/50 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2 font-semibold text-forest">
            {applied ? <Check aria-hidden className="h-4 w-4 shrink-0" /> : <Tag aria-hidden className="h-4 w-4 shrink-0" />}
            <span className="truncate">{code}</span>
            {applied && <span className="font-normal">· {c.couponApplied}</span>}
          </span>
          <button type="button" onClick={onRemove} aria-label={c.couponRemove} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white"><X aria-hidden className="h-4 w-4" /></button>
        </div>
        {error && <p role="alert" className="text-xs font-medium text-danger">{c.couponReasons[error.reason as keyof typeof c.couponReasons] ?? error.message}</p>}
        {applied?.freeDelivery && <p className="text-xs text-forest">{c.couponFree}</p>}
      </div>
    );
  }
  // NOT a <form>: this box lives inside the checkout form, and a nested form's submit event would bubble up and
  // submit (even place!) the whole order. Enter is handled explicitly instead.
  const submit = () => { const v = draft.trim().toUpperCase(); if (v) { onApply(v); setDraft(''); } };
  return (
    <div className="flex gap-2">
      <Input
        aria-label={c.couponLabel} placeholder={c.couponPlaceholder} value={draft} onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
        autoCapitalize="characters" autoComplete="off" maxLength={30}
      />
      <Button type="button" variant="outline" disabled={!draft.trim()} onClick={submit}>{c.apply}</Button>
    </div>
  );
}
