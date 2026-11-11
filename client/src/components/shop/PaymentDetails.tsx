import { Info } from 'lucide-react';
import { usePayT } from '@/hooks/useT';
import type { BankDetails } from '@/types/api';

/** The owner's account details + instructions for a manual method. All text comes from Admin → Payments (the database). */
export function PaymentDetails({ channelName, number, bank, instructions }: { channelName: string; number?: string | null; bank?: BankDetails | null; instructions?: string | null }) {
  const p = usePayT();
  const rows: [string, string | null | undefined][] = bank
    ? [[p.bankName, bank.bankName], [p.accountName, bank.accountName], [p.accountNumber, bank.accountNumber], [p.branch, bank.branch]]
    : [[channelName, number]];
  return (
    <div className="space-y-2 rounded-lg bg-sage-light/50 p-4 text-sm" data-testid="payment-details">
      <p className="flex items-center gap-2 font-semibold text-forest"><Info aria-hidden className="h-4 w-4" />{p.howToPay}</p>
      {instructions && <p className="whitespace-pre-line text-charcoal">{instructions}</p>}
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {rows.filter(([, v]) => v).map(([k, v]) => (<div key={k} className="contents"><dt className="text-charcoal-soft">{k}</dt><dd className="font-mono font-semibold text-charcoal">{v}</dd></div>))}
      </dl>
      <p className="text-charcoal-soft">{p.afterOrder}</p>
    </div>
  );
}
