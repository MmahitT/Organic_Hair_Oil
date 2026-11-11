import { useState } from 'react';
import { adminFetch, useAdminAuth } from '../auth';
import { errMsg, useLoad } from '../hooks';
import { Alert, Badge, Btn, Card, Field, Input, Pager, Select } from '../ui';

interface Staff { _id: string; name: string; email: string; role: 'superadmin' | 'admin' | 'staff'; isActive: boolean; lastLoginAt?: string }
const ROLE_HELP: Record<string, string> = {
  admin: 'Everything except managing the team and the audit log.',
  staff: 'Orders, inventory and reviews only — no money figures, customers, settings or exports.',
};

export function StaffPage() {
  const me = useAdminAuth((a) => a.account);
  const { data, error, reload } = useLoad(async () => (await adminFetch<{ staff: Staff[] }>('/admin/staff')).data.staff, 'staff');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [open, setOpen] = useState(false);
  const [errs, setErrs] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (form.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setErrs('Enter a name and a valid email.');
    if (form.password.length < 8) return setErrs('Choose a password of at least 8 characters.');
    setBusy(true); setErrs(null); setFlash(null);
    try { await adminFetch('/admin/staff', { method: 'POST', body: { name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role } }); setForm({ name: '', email: '', password: '', role: 'staff' }); setOpen(false); setFlash({ tone: 'success', text: 'Team member added. Share their password with them privately.' }); await reload(); } catch (e) { setErrs(errMsg(e, 'Could not add this person')); } finally { setBusy(false); }
  };
  const change = async (s: Staff, body: object, ok: string) => {
    setFlash(null);
    try { await adminFetch(`/admin/staff/${s._id}`, { method: 'PATCH', body }); setFlash({ tone: 'success', text: ok }); await reload(); } catch (e) { setFlash({ tone: 'error', text: errMsg(e, 'Could not update') }); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">Team</h1><p className="text-sm text-charcoal-soft">People who can sign in to this admin. Only you (the owner account) can manage this list.</p></div><Btn onClick={() => setOpen(!open)}>{open ? 'Close' : 'Add team member'}</Btn></div>
      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}
      {open && (
        <Card title="Add a team member">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} autoComplete="off" /></Field>
            <Field label="Email (their sign-in)"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" /></Field>
            <Field label="Temporary password" hint="At least 8 characters. They should change it after signing in."><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Role" hint={ROLE_HELP[form.role]}><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="staff">Staff</option><option value="admin">Admin</option></Select></Field>
          </div>
          {errs && <div className="mt-3"><Alert>{errs}</Alert></div>}
          <Btn className="mt-4" disabled={busy} onClick={() => void create()}>{busy ? 'Adding…' : 'Add team member'}</Btn>
        </Card>
      )}
      <Card>
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void reload()}>Retry</button></Alert>}
        {!error && !data && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {data && (
          <ul className="divide-y divide-sage/40">
            {data.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-semibold">{s.name} {s._id === me?._id && <span className="text-xs font-normal text-charcoal-soft">(you)</span>}</p><p className="text-sm text-charcoal-soft">{s.email}{s.lastLoginAt ? ` · last sign-in ${new Date(s.lastLoginAt).toLocaleDateString()}` : ' · never signed in'}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge kind={s.role === 'staff' ? 'draft' : 'published'}>{s.role}</Badge>{!s.isActive && <Badge kind="out_of_stock">disabled</Badge>}
                  {s.role !== 'superadmin' && s._id !== me?._id && (
                    <>
                      <Select aria-label={`Role for ${s.name}`} className="!min-h-9 w-28" value={s.role} onChange={(e) => void change(s, { role: e.target.value }, `${s.name} is now ${e.target.value}.`)}><option value="staff">Staff</option><option value="admin">Admin</option></Select>
                      <Btn tone={s.isActive ? 'secondary' : 'primary'} className="min-h-9 px-3" onClick={() => void change(s, { isActive: !s.isActive }, s.isActive ? `${s.name} was disabled and signed out everywhere.` : `${s.name} can sign in again.`)}>{s.isActive ? 'Disable' : 'Enable'}</Btn>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

interface Log { _id: string; action: string; actorKind: string; role?: string; actor?: string; entityType?: string; entityId?: string; createdAt: string; before?: unknown; after?: unknown; ip?: string }

export function AuditPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const limit = 25;
  const { data, error, reload } = useLoad(async () => { const r = await adminFetch<{ items: Log[] }>('/admin/audit-logs', { query: { page, limit, q } }); return { items: r.data.items, total: r.meta?.total ?? 0 }; }, `${page}|${q}`);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div><h1 className="text-3xl font-bold">Activity log</h1><p className="text-sm text-charcoal-soft">A permanent record of sensitive actions: price and stock changes, payment decisions, refunds, blocks, exports, settings and team changes.</p></div>
      <Card>
        <div className="mb-4 max-w-sm"><Input aria-label="Search the log" placeholder="Search action (e.g. payment, settings)" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        {error && <Alert>{error} <button className="font-semibold underline" onClick={() => void reload()}>Retry</button></Alert>}
        {!error && !data && <p role="status" className="py-8 text-center text-charcoal-soft">Loading…</p>}
        {data && data.items.length === 0 && <p className="py-8 text-center text-charcoal-soft">Nothing recorded yet.</p>}
        {data && data.items.length > 0 && (
          <ul className="divide-y divide-sage/40 text-sm">
            {data.items.map((l) => (
              <li key={l._id} className="py-2.5">
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" aria-expanded={open === l._id} onClick={() => setOpen(open === l._id ? null : l._id)}>
                  <span><span className="font-mono font-semibold">{l.action}</span>{l.entityType && <span className="text-charcoal-soft"> · {l.entityType}{l.entityId ? ` ${String(l.entityId).slice(-8)}` : ''}</span>}</span>
                  <span className="text-xs text-charcoal-soft">{l.role ?? l.actorKind}{l.actor ? ` …${l.actor.slice(-6)}` : ''} · {new Date(l.createdAt).toLocaleString()}</span>
                </button>
                {open === l._id && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-cream p-3 text-xs">{JSON.stringify({ before: l.before, after: l.after, ip: l.ip }, null, 2)}</pre>}
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} limit={limit} total={data?.total ?? 0} onPage={setPage} />
      </Card>
    </div>
  );
}
