import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adminFetch } from '../auth';
import { errMsg, useLoad } from '../hooks';
import { Alert, Btn, Card, Field, Input, Textarea } from '../ui';

interface Business { name: string; legalName: string; phone: string; whatsapp: string; email: string; address: string; social: { facebook: string; instagram: string; youtube: string; tiktok: string } }
interface Zone { key: string; name: string; fee: number; etaDays: string; active: boolean; districts: string[] }
interface Delivery { defaultZoneKey: string; zones: Zone[] }
interface Faq { q: string; a: string; qBn?: string; aBn?: string }
interface Content { announcement: { text: string; textBn: string; link: string; active: boolean; expiresAt: string | null }; faq: Faq[] }
interface Seo { title: string; description: string; titleBn: string; descriptionBn: string; ogImage: string; ga4Id: string; metaPixelId: string }
type Slug = 'privacy' | 'terms' | 'refund' | 'shipping';
interface Legal { privacy: string; terms: string; refund: string; shipping: string; reviewed: boolean; templates: Record<Slug, string> }
interface Settings { business: Business; delivery: Delivery; content: Content; seo: Seo; legal: Legal }
type Note = { tone: 'error' | 'success'; text: string } | null;

/** Saves one settings section and reports success/failure next to the button. */
function useSection<T>(section: 'business' | 'delivery' | 'content' | 'seo' | 'legal', onSaved: (s: Settings) => void) {
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const save = async (body: T) => {
    setBusy(true); setNote(null);
    try { onSaved((await adminFetch<Settings>(`/admin/settings/${section}`, { method: 'PUT', body })).data); setNote({ tone: 'success', text: 'Saved. The website shows this within about 10 seconds.' }); } catch (e) { setNote({ tone: 'error', text: errMsg(e, 'Could not save') }); } finally { setBusy(false); }
  };
  return { note, busy, save };
}

function BusinessCard({ initial, onSaved }: { initial: Business; onSaved: (s: Settings) => void }) {
  const [b, setB] = useState(initial);
  const { note, busy, save } = useSection<Business>('business', onSaved);
  const f = (k: keyof Omit<Business, 'social'>) => (e: React.ChangeEvent<HTMLInputElement>) => setB({ ...b, [k]: e.target.value });
  const s = (k: keyof Business['social']) => (e: React.ChangeEvent<HTMLInputElement>) => setB({ ...b, social: { ...b.social, [k]: e.target.value } });
  return (
    <Card title="Business details">
      <p className="mb-3 text-sm text-charcoal-soft">Shown in the website footer, contact page and invoices. Leave a field empty to hide it.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Shop name"><Input value={b.name} onChange={f('name')} maxLength={80} /></Field>
        <Field label="Legal business name (invoices)"><Input value={b.legalName} onChange={f('legalName')} maxLength={120} /></Field>
        <Field label="Phone (as shown to customers)"><Input value={b.phone} onChange={f('phone')} inputMode="tel" maxLength={20} placeholder="01XXXXXXXXX" /></Field>
        <Field label="WhatsApp number" hint="International form, e.g. 8801XXXXXXXXX"><Input value={b.whatsapp} onChange={f('whatsapp')} inputMode="tel" maxLength={13} /></Field>
        <Field label="Email"><Input value={b.email} onChange={f('email')} type="email" maxLength={254} /></Field>
        <Field label="Address"><Input value={b.address} onChange={f('address')} maxLength={200} /></Field>
        {(['facebook', 'instagram', 'youtube', 'tiktok'] as const).map((k) => <Field key={k} label={`${k[0]!.toUpperCase()}${k.slice(1)} page (https://…)`}><Input value={b.social[k]} onChange={s(k)} type="url" maxLength={300} /></Field>)}
      </div>
      {note && <div className="mt-3"><Alert tone={note.tone}>{note.text}</Alert></div>}
      <Btn className="mt-4" disabled={busy} onClick={() => void save(b)}>{busy ? 'Saving…' : 'Save business details'}</Btn>
    </Card>
  );
}

function DeliveryCard({ initial, districts, onSaved }: { initial: Delivery; districts: string[]; onSaved: (s: Settings) => void }) {
  const [d, setD] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const { note, busy, save } = useSection<Delivery>('delivery', onSaved);
  const upd = (key: string, patch: Partial<Zone>) => setD({ ...d, zones: d.zones.map((z) => (z.key === key ? { ...z, ...patch } : z)) });
  const owner = (name: string) => d.zones.find((z) => z.districts.includes(name))?.name;
  const toggle = (zone: Zone, name: string) => {
    // a district can only be in one zone: ticking it moves it here
    setD({ ...d, zones: d.zones.map((z) => (z.key === zone.key ? { ...z, districts: z.districts.includes(name) ? z.districts.filter((x) => x !== name) : [...z.districts, name] } : { ...z, districts: z.districts.filter((x) => x !== name) })) });
  };
  const add = () => {
    let i = d.zones.length + 1; while (d.zones.some((z) => z.key === `zone_${i}`)) i++;
    setD({ ...d, zones: [...d.zones, { key: `zone_${i}`, name: `New zone ${i}`, fee: 0, etaDays: '', active: true, districts: [] }] });
  };
  const remove = (key: string) => setD({ ...d, zones: d.zones.filter((z) => z.key !== key), defaultZoneKey: d.defaultZoneKey === key ? d.zones.find((z) => z.key !== key)?.key ?? '' : d.defaultZoneKey });
  return (
    <Card title="Delivery areas and charges">
      <p className="mb-3 text-sm text-charcoal-soft">A customer’s district decides the zone and the delivery charge. Districts not listed in any zone use the <strong>default zone</strong>. Combo orders that include free delivery are not affected.</p>
      <div className="space-y-4">
        {d.zones.map((z) => (
          <div key={z.key} className="rounded-lg border border-sage/60 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_130px_150px_auto] sm:items-end">
              <Field label="Zone name"><Input value={z.name} onChange={(e) => upd(z.key, { name: e.target.value })} maxLength={60} /></Field>
              <Field label="Charge (৳)"><Input inputMode="numeric" value={String(z.fee)} onChange={(e) => upd(z.key, { fee: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
              <Field label="Delivery time (optional)"><Input value={z.etaDays} onChange={(e) => upd(z.key, { etaDays: e.target.value })} maxLength={30} placeholder="e.g. 2–3 days" /></Field>
              <div className="flex items-center gap-3 pb-1">
                <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-forest" checked={z.active} onChange={(e) => upd(z.key, { active: e.target.checked })} />Active</label>
                {d.zones.length > 1 && <button type="button" aria-label={`Remove ${z.name}`} onClick={() => remove(z.key)} className="grid h-11 w-11 place-items-center rounded-lg text-danger hover:bg-danger/10"><Trash2 aria-hidden className="h-4 w-4" /></button>}
              </div>
            </div>
            <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="default-zone" className="h-5 w-5 accent-forest" checked={d.defaultZoneKey === z.key} onChange={() => setD({ ...d, defaultZoneKey: z.key })} />Default zone (used for any district not ticked in a zone)</label>
            <button type="button" className="mt-1 text-sm font-semibold text-forest hover:underline" aria-expanded={open === z.key} onClick={() => setOpen(open === z.key ? null : z.key)}>{open === z.key ? 'Hide districts' : `Districts (${z.districts.length})`}</button>
            {open === z.key && (
              <ul className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-3">
                {districts.map((name) => { const o = owner(name); return <li key={name}><label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest" checked={z.districts.includes(name)} onChange={() => toggle(z, name)} />{name}{o && o !== z.name && <span className="text-xs text-charcoal-soft">({o})</span>}</label></li>; })}
              </ul>
            )}
          </div>
        ))}
      </div>
      <Btn tone="secondary" className="mt-3" onClick={add}><Plus aria-hidden className="h-4 w-4" />Add a zone</Btn>
      {note && <div className="mt-3"><Alert tone={note.tone}>{note.text}</Alert></div>}
      <div className="mt-4"><Btn disabled={busy} onClick={() => void save(d)}>{busy ? 'Saving…' : 'Save delivery settings'}</Btn></div>
    </Card>
  );
}

function ContentCard({ initial, onSaved }: { initial: Content; onSaved: (s: Settings) => void }) {
  const [c, setC] = useState(initial);
  const { note, busy, save } = useSection<unknown>('content', onSaved);
  const a = c.announcement;
  const setA = (patch: Partial<Content['announcement']>) => setC({ ...c, announcement: { ...a, ...patch } });
  const setFaq = (i: number, patch: Partial<Faq>) => setC({ ...c, faq: c.faq.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Card title="Announcement bar and FAQ">
      <h3 className="text-base font-bold">Announcement bar</h3>
      <p className="mb-3 text-sm text-charcoal-soft">The strip at the very top of the website. Turn it off to show nothing (or the built-in combo offer line).</p>
      <label className="mb-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-forest" checked={a.active} onChange={(e) => setA({ active: e.target.checked })} />Show the announcement bar</label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Message (English)"><Input value={a.text} onChange={(e) => setA({ text: e.target.value })} maxLength={200} /></Field>
        <Field label="Message (বাংলা)"><Input value={a.textBn} onChange={(e) => setA({ textBn: e.target.value })} maxLength={200} /></Field>
        <Field label="Link (optional)" hint="#offer, /track or an https:// address"><Input value={a.link} onChange={(e) => setA({ link: e.target.value })} maxLength={200} /></Field>
        <Field label="Hide after (optional)"><Input type="date" value={a.expiresAt ? a.expiresAt.slice(0, 10) : ''} onChange={(e) => setA({ expiresAt: e.target.value || null })} /></Field>
      </div>

      <h3 className="mt-6 text-base font-bold">Frequently asked questions</h3>
      <p className="mb-3 text-sm text-charcoal-soft">When you add questions here they <strong>replace</strong> the built-in FAQ on the website. Remove all of them to go back to the built-in answers. Please keep answers factual (no medical claims you cannot support).</p>
      <div className="space-y-4">
        {c.faq.map((x, i) => (
          <div key={i} className="rounded-lg border border-sage/60 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Question (English)"><Input value={x.q} onChange={(e) => setFaq(i, { q: e.target.value })} maxLength={200} /></Field>
              <Field label="প্রশ্ন (বাংলা, optional)"><Input value={x.qBn ?? ''} onChange={(e) => setFaq(i, { qBn: e.target.value })} maxLength={200} /></Field>
              <Field label="Answer (English)"><Textarea rows={3} value={x.a} onChange={(e) => setFaq(i, { a: e.target.value })} maxLength={1000} /></Field>
              <Field label="উত্তর (বাংলা, optional)"><Textarea rows={3} value={x.aBn ?? ''} onChange={(e) => setFaq(i, { aBn: e.target.value })} maxLength={1000} /></Field>
            </div>
            <Btn tone="ghost" className="mt-2 text-danger" onClick={() => setC({ ...c, faq: c.faq.filter((_, j) => j !== i) })}><Trash2 aria-hidden className="h-4 w-4" />Remove question</Btn>
          </div>
        ))}
      </div>
      {c.faq.length < 20 && <Btn tone="secondary" className="mt-3" onClick={() => setC({ ...c, faq: [...c.faq, { q: '', a: '' }] })}><Plus aria-hidden className="h-4 w-4" />Add a question</Btn>}
      {note && <div className="mt-3"><Alert tone={note.tone}>{note.text}</Alert></div>}
      <div className="mt-4"><Btn disabled={busy} onClick={() => void save({ announcement: { text: a.text, textBn: a.textBn, link: a.link, active: a.active, expiresAt: a.expiresAt ?? '' }, faq: c.faq.map((x) => ({ q: x.q, a: x.a, qBn: x.qBn ?? '', aBn: x.aBn ?? '' })) })}>{busy ? 'Saving…' : 'Save announcement and FAQ'}</Btn></div>
    </Card>
  );
}


function Counter({ value, max }: { value: string; max: number }) {
  return <span className={value.length > max ? 'text-danger' : 'text-charcoal-soft'}>{value.length}/{max}</span>;
}

function SeoCard({ initial, onSaved }: { initial: Seo; onSaved: (s: Settings) => void }) {
  const [v, setV] = useState(initial);
  const { note, busy, save } = useSection<Seo>('seo', onSaved);
  const f = (k: keyof Seo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Card title="Search, sharing and tracking">
      <p className="mb-3 text-sm text-charcoal-soft">How the shop appears in Google and when a link is shared on Facebook or WhatsApp. Leave a field empty to use the built-in text.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Page title (English)" hint={<><Counter value={v.title} max={60} /> · up to 60 characters</>}><Input value={v.title} onChange={f('title')} maxLength={80} /></Field>
        <Field label="Page title (বাংলা)" hint={<><Counter value={v.titleBn} max={70} /> · up to 70</>}><Input value={v.titleBn} onChange={f('titleBn')} maxLength={90} /></Field>
        <Field label="Description (English)" hint={<><Counter value={v.description} max={155} /> · up to 155 characters</>}><Textarea rows={3} value={v.description} onChange={f('description')} maxLength={200} /></Field>
        <Field label="Description (বাংলা)" hint={<><Counter value={v.descriptionBn} max={160} /> · up to 160</>}><Textarea rows={3} value={v.descriptionBn} onChange={f('descriptionBn')} maxLength={200} /></Field>
        <Field label="Sharing image (optional)" hint="An https:// address or a /path on this site, 1200×630 works best. Empty = the built-in image." className="sm:col-span-2"><Input value={v.ogImage} onChange={f('ogImage')} maxLength={300} placeholder="/images/og-share.jpg" /></Field>
      </div>
      <h3 className="mt-6 text-base font-bold">Tracking (optional)</h3>
      <p className="mb-3 text-sm text-charcoal-soft">Paste the IDs from Google Analytics and Meta Business Suite. Nothing is tracked until a visitor accepts the cookie banner, and the banner only appears when at least one ID is set. Leave both empty to use no tracking at all.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Google Analytics 4 ID" hint="Looks like G-ABC123XYZ"><Input value={v.ga4Id} onChange={f('ga4Id')} maxLength={20} autoComplete="off" placeholder="G-XXXXXXXXXX" /></Field>
        <Field label="Meta Pixel ID" hint="8–20 digits"><Input value={v.metaPixelId} onChange={f('metaPixelId')} inputMode="numeric" maxLength={20} autoComplete="off" /></Field>
      </div>
      {note && <div className="mt-3"><Alert tone={note.tone}>{note.text}</Alert></div>}
      <Btn className="mt-4" disabled={busy} onClick={() => void save(v)}>{busy ? 'Saving…' : 'Save search & tracking settings'}</Btn>
    </Card>
  );
}

const POLICIES: { slug: Slug; title: string; path: string }[] = [
  { slug: 'privacy', title: 'Privacy Policy', path: '/privacy' }, { slug: 'terms', title: 'Terms & Conditions', path: '/terms' },
  { slug: 'refund', title: 'Return & Refund Policy', path: '/returns' }, { slug: 'shipping', title: 'Shipping & Delivery Policy', path: '/shipping' },
];

function LegalCard({ initial, onSaved }: { initial: Legal; onSaved: (s: Settings) => void }) {
  const [v, setV] = useState(initial);
  const [open, setOpen] = useState<Slug | null>(null);
  const { note, busy, save } = useSection<unknown>('legal', onSaved);
  return (
    <Card title="Legal pages">
      <Alert tone="info">The pages below start as <strong>draft templates</strong> that I wrote without any registrations, certifications or medical claims. They are <strong>not legal advice</strong>. Please read each one, change anything that is not true for your business (ideally with a lawyer), then tick “I have reviewed these” — until then visitors see a “draft” notice.</Alert>
      <p className="my-3 text-sm text-charcoal-soft">Leave a box empty to keep using the built-in draft. Your text can use these placeholders, which are filled in from your other settings: <code>{'{{businessName}}'}</code> <code>{'{{phone}}'}</code> <code>{'{{whatsapp}}'}</code> <code>{'{{email}}'}</code> <code>{'{{address}}'}</code> <code>{'{{updated}}'}</code> <code>{'{{returnWindow}}'}</code> <code>{'{{deliveryTable}}'}</code>. Formatting: <code># Heading</code>, <code>## Subheading</code>, <code>- list item</code>, <code>**bold**</code>.</p>
      <div className="space-y-3">
        {POLICIES.map((p) => (
          <div key={p.slug} className="rounded-lg border border-sage/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button type="button" className="text-left font-semibold" aria-expanded={open === p.slug} onClick={() => setOpen(open === p.slug ? null : p.slug)}>{p.title} <span className="text-xs font-normal text-charcoal-soft">{v[p.slug].trim() ? '· your text' : '· built-in draft'}</span></button>
              <a href={p.path} target="_blank" rel="noreferrer" className="text-sm font-semibold text-forest hover:underline">View page</a>
            </div>
            {open === p.slug && (
              <div className="mt-3 space-y-2">
                <Field label={`${p.title} (Markdown)`}><Textarea rows={14} className="font-mono text-sm" value={v[p.slug]} maxLength={20000} onChange={(e) => setV({ ...v, [p.slug]: e.target.value })} /></Field>
                <div className="flex flex-wrap gap-2">
                  <Btn tone="secondary" className="min-h-9 px-3" onClick={() => setV({ ...v, [p.slug]: v.templates[p.slug] })}>Start from the template</Btn>
                  <Btn tone="ghost" className="min-h-9 px-3" onClick={() => setV({ ...v, [p.slug]: '' })}>Use the built-in draft</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <label className="mt-4 flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-5 w-5 accent-forest" checked={v.reviewed} onChange={(e) => setV({ ...v, reviewed: e.target.checked })} /><span><strong>I have reviewed these policies</strong> and they are correct for my business. (Removes the “draft” notice from the public pages.)</span></label>
      {note && <div className="mt-3"><Alert tone={note.tone}>{note.text}</Alert></div>}
      <Btn className="mt-4" disabled={busy} onClick={() => void save({ privacy: v.privacy, terms: v.terms, refund: v.refund, shipping: v.shipping, reviewed: v.reviewed })}>{busy ? 'Saving…' : 'Save legal pages'}</Btn>
    </Card>
  );
}

export default function WebsitePage() {
  const { data, error, reload, setData } = useLoad(async () => (await adminFetch<Settings>('/admin/settings')).data, 'settings');
  const [districts, setDistricts] = useState<string[]>([]);
  useEffect(() => { adminFetch<{ districts: string[] }>('/delivery/zones').then((r) => setDistricts(r.data.districts)).catch(() => undefined); }, []);
  // Each card keeps its own draft; a save from any card refreshes the saved copy without remounting the others.
  const saved = (s: Settings) => setData(s);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div><h1 className="text-3xl font-bold">Website</h1><p className="text-sm text-charcoal-soft">Business details, delivery charges and the text customers see. Product prices and stock are under Products and Inventory; payment details are under Payments.</p></div>
      {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void reload()}>Retry</button></Alert>}
      {!data && !error && <p role="status" className="py-10 text-center text-charcoal-soft">Loading…</p>}
      {data && (
        <>
          <BusinessCard initial={data.business} onSaved={saved} />
          <DeliveryCard initial={data.delivery} districts={districts} onSaved={saved} />
          <ContentCard initial={data.content} onSaved={saved} />
          <SeoCard initial={data.seo} onSaved={saved} />
          <LegalCard initial={data.legal} onSaved={saved} />
        </>
      )}
    </div>
  );
}
