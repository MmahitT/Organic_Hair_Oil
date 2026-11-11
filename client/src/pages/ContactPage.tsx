import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckoutHeader } from '@/components/shop/CheckoutHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Form';
import { useShop } from '@/hooks/useShop';
import { useOrdersT } from '@/hooks/useT';
import { Seo } from '@/lib/seo';
import { ApiError, apiFetch } from '@/lib/api';
import { normalizeBdPhone } from '@/lib/phone';

/** Public contact form. The "website" field is a honeypot hidden from people; bots that fill it are ignored server-side. */
export default function ContactPage() {
  const c = useOrdersT().contact;
  const { settings } = useShop();
  const biz = settings?.business;
  const [f, setF] = useState({ name: '', phone: '', email: '', message: '', website: '' });
  const [errs, setErrs] = useState<Partial<Record<'name' | 'phone' | 'email' | 'message' | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    const e: typeof errs = {};
    const phone = f.phone.trim() ? normalizeBdPhone(f.phone) : null;
    if (f.name.trim().length < 2) e.name = c.name;
    if (f.phone.trim() && !phone) e.phone = c.phone;
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = c.email;
    if (!phone && !f.email.trim()) e.phone = c.needReply;
    if (f.message.trim().length < 5) e.message = c.message;
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await apiFetch('/contact', { method: 'POST', body: { name: f.name.trim(), ...(phone ? { phone } : {}), ...(f.email.trim() ? { email: f.email.trim() } : {}), message: f.message.trim(), website: f.website } });
      setDone(true); setF({ name: '', phone: '', email: '', message: '', website: '' });
    } catch (x) { setErrs({ form: x instanceof ApiError && x.status === 429 ? c.rateLimited : c.error }); } finally { setBusy(false); }
  };

  return (
    <>
      <Seo title={`${c.title} — ${biz?.name ?? 'Beauty Organic Hair Oil'}`} description={c.intro} path="/contact" />
      <CheckoutHeader title={c.title} />
      <main className="container-page max-w-xl py-8 sm:py-12">
        {done ? (
          <div role="status" className="rounded-xl2 bg-white p-8 text-center shadow-card">
            <h1 className="text-2xl font-bold">{c.done}</h1>
            <p className="mt-2 text-charcoal-soft">{c.doneText}</p>
            <Button className="mt-5" variant="outline" onClick={() => setDone(false)}>{c.another}</Button>
            <p className="mt-4"><Link to="/" className="font-semibold text-forest hover:underline">{c.back}</Link></p>
          </div>
        ) : (
          <section className="rounded-xl2 bg-white p-5 shadow-card sm:p-8" aria-labelledby="h-contact">
            <h1 id="h-contact" className="text-2xl font-bold sm:text-3xl">{c.title}</h1>
            <p className="mt-1 text-charcoal-soft">{c.intro}</p>
            {(biz?.phone || biz?.email || biz?.address) && (
              <ul className="mt-3 space-y-1 rounded-lg bg-cream p-3 text-sm" aria-label="Contact details">
                {biz?.phone && <li><a href={`tel:${biz.phone.replace(/\s/g, '')}`} className="font-semibold text-forest hover:underline">{biz.phone}</a></li>}
                {biz?.email && <li><a href={`mailto:${biz.email}`} className="font-semibold text-forest hover:underline">{biz.email}</a></li>}
                {biz?.address && <li className="text-charcoal-soft">{biz.address}</li>}
              </ul>
            )}
            <form className="mt-5 space-y-4" noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
              <Field label={c.name} error={errs.name}><Input value={f.name} onChange={set('name')} autoComplete="name" maxLength={80} aria-invalid={!!errs.name} /></Field>
              <Field label={c.phone} hint={c.phoneHint} error={errs.phone}><Input value={f.phone} onChange={set('phone')} type="tel" inputMode="tel" autoComplete="tel" aria-invalid={!!errs.phone} /></Field>
              <Field label={c.email} error={errs.email}><Input value={f.email} onChange={set('email')} type="email" autoComplete="email" aria-invalid={!!errs.email} /></Field>
              <Field label={c.message} hint={c.messageHint} error={errs.message}><Textarea rows={5} value={f.message} onChange={set('message')} maxLength={1500} aria-invalid={!!errs.message} /></Field>
              {/* honeypot: invisible and unreachable for people */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} /></label></div>
              {errs.form && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{errs.form}</p>}
              <Button type="submit" size="lg" full disabled={busy}>{busy ? c.sending : c.send}</Button>
            </form>
          </section>
        )}
      </main>
    </>
  );
}
