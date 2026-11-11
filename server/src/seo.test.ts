import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LEGAL_TEMPLATES } from './constants/legalTemplates.js';
import { AuditLog, Product, WebsiteSettings } from './models/index.js';
import { runSeed } from './scripts/seed.js';
import { fillTemplate } from './services/legal.service.js';
import { clearDb, startTestDb, stopTestDb } from './test/db.js';
import { api, bearer, makeAdmin } from './test/helpers.js';

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearDb);

async function shop() {
  await runSeed({ stock: 10 });
  await Product.updateMany({}, { $set: { visibility: 'published' } });
  await WebsiteSettings.updateOne({ key: 'main' }, { $set: { 'business.address': '12 Example Road, Dhaka', 'business.email': 'hello@example.com' } });
}
const legal = (slug: string) => api().get(`/api/v1/legal/${slug}`);
const put = (token: string, section: string, body: object) => api().put(`/api/v1/admin/settings/${section}`).set(bearer(token)).send(body);

describe('template filling', () => {
  it('replaces tokens, drops optional lines whose value is missing, and never leaves a raw token', () => {
    const out = fillTemplate('Hello {{name}}\n?phone|Phone: {{phone}}\n?email|Email: {{email}}\n\n\n\nBye {{unknown}}', { name: 'Shop', phone: '0171' });
    expect(out).toBe('Hello Shop\nPhone: 0171\n\nBye ');
    expect(out).not.toContain('{{');
  });
});

describe('legal pages', () => {
  it('serves all four pages as clearly-marked drafts, filled from the owner’s real settings', async () => {
    await shop();
    const admin = await makeAdmin('admin');
    await api().patch('/api/v1/admin/settings/orders').set(bearer(admin.token)).send({ returnWindowDays: 7 });
    const idx = (await api().get('/api/v1/legal')).body.data.pages;
    expect(idx.map((p: { slug: string }) => p.slug)).toEqual(['privacy', 'terms', 'refund', 'shipping']);
    const shipping = (await legal('shipping')).body.data;
    expect(shipping).toMatchObject({ slug: 'shipping', title: 'Shipping & Delivery Policy', reviewed: false, isTemplate: true });
    expect(shipping.markdown).toContain('- Inside Rangpur: ৳60');
    expect(shipping.markdown).toContain('- Outside Rangpur: ৳120');
    expect(shipping.markdown).toContain('delivered free of charge'); // the combo's free delivery comes from the product, not from text
    expect(shipping.markdown).toContain('12 Example Road, Dhaka');
    expect(shipping.markdown).toContain('hello@example.com');
    expect(shipping.markdown).toContain('draft template pending review');
    expect((await legal('refund')).body.data.markdown).toContain('within **7 days** of delivery');
    for (const slug of ['privacy', 'terms', 'refund', 'shipping']) expect((await legal(slug)).body.data.markdown).not.toMatch(/\{\{|\?\w+\|/);
  });
  it('follows live settings: new fees, no return window, missing contact details', async () => {
    await shop();
    const admin = await makeAdmin('admin');
    expect((await legal('refund')).body.data.markdown).toContain('please contact us'); // no window configured → no invented number
    const cur = (await api().get('/api/v1/admin/settings').set(bearer(admin.token))).body.data.delivery;
    await put(admin.token, 'delivery', { defaultZoneKey: cur.defaultZoneKey, zones: cur.zones.map((z: { key: string; fee: number }) => (z.key === 'inside_rangpur' ? { ...z, fee: 75 } : z)) });
    expect((await legal('shipping')).body.data.markdown).toContain('- Inside Rangpur: ৳75');
    await WebsiteSettings.updateOne({ key: 'main' }, { $unset: { 'business.email': '', 'business.address': '' } });
    const md = (await legal('terms')).body.data.markdown;
    expect(md).not.toContain('Email:');
    expect(md).not.toContain('Address:');
  });
  it('contains no invented registrations, certifications, medical claims or guarantees', () => {
    const all = Object.values(LEGAL_TEMPLATES).join('\n').toLowerCase();
    for (const banned of [/100%/, /guarantee/, /certif/, /\bbsti\b/, /\biso\b/, /trade licen/, /\btin\b/, /\bcures?\b/, /\btreat(s|ment)?\b/, /clinical/, /dermatolog/, /hair loss/, /organic/]) expect(all).not.toMatch(banned);
  });
  it('lets the owner replace the text, mark it reviewed, and keeps tokens working', async () => {
    await shop();
    const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    expect((await put(staff.token, 'legal', { reviewed: true })).status).toBe(403);
    expect((await put(admin.token, 'legal', { privacy: 'x'.repeat(20001), reviewed: false })).status).toBe(400);
    expect((await put(admin.token, 'legal', { privacy: 'a', reviewed: 'yes' })).status).toBe(400);
    expect((await put(admin.token, 'legal', { privacy: 'a', reviewed: true, extra: 1 })).status).toBe(400);
    const saved = await put(admin.token, 'legal', { privacy: '# Our privacy\n\nWe are {{businessName}}.\n?email|Write to {{email}}', terms: '', refund: '', shipping: '', reviewed: true });
    expect(saved.status).toBe(200);
    expect(saved.body.data.legal).toMatchObject({ reviewed: true, privacy: expect.stringContaining('Our privacy') });
    expect(Object.keys(saved.body.data.legal.templates)).toEqual(['privacy', 'terms', 'refund', 'shipping']);
    const p = (await legal('privacy')).body.data;
    expect(p).toMatchObject({ reviewed: true, isTemplate: false });
    expect(p.markdown).toBe('# Our privacy\n\nWe are Beauty Organic Hair Oil.\nWrite to hello@example.com');
    expect((await legal('terms')).body.data).toMatchObject({ isTemplate: true, reviewed: true }); // empty text → template again
    const log = await AuditLog.findOne({ action: 'settings.legal.update' });
    expect(log!.after).toMatchObject({ reviewed: true });
    expect(JSON.stringify(log!.after)).not.toContain('Our privacy'); // the log keeps lengths, not the policy text
  });
  it('rejects unknown policy names and sets a short cache', async () => {
    await shop();
    expect((await legal('nonsense')).status).toBe(400);
    expect((await legal('privacy')).headers['cache-control']).toContain('max-age=60');
  });
});

describe('SEO and tracking settings', () => {
  it('validates titles, descriptions, image and tracking IDs, then serves them publicly', async () => {
    await shop();
    const admin = await makeAdmin('admin'); const staff = await makeAdmin('staff');
    const ok = { title: 'Beauty Organic Hair Oil — Hair Oil & Powder', description: 'Natural hair oil and hair powder, delivered across Bangladesh.', titleBn: '', descriptionBn: '', ogImage: '/images/og.jpg', ga4Id: 'G-ABC123XYZ9', metaPixelId: '123456789012345' };
    expect((await put(staff.token, 'seo', ok)).status).toBe(403);
    expect((await put(admin.token, 'seo', { ...ok, title: 'x'.repeat(61) })).status).toBe(400);
    expect((await put(admin.token, 'seo', { ...ok, description: 'x'.repeat(156) })).status).toBe(400);
    expect((await put(admin.token, 'seo', { ...ok, ogImage: 'javascript:alert(1)' })).status).toBe(400);
    expect((await put(admin.token, 'seo', { ...ok, ogImage: 'http://insecure.example/x.jpg' })).status).toBe(400);
    expect((await put(admin.token, 'seo', { ...ok, ga4Id: 'UA-123' })).status).toBe(400);
    expect((await put(admin.token, 'seo', { ...ok, ga4Id: 'G-ABC"><script>' })).status).toBe(400);
    expect((await put(admin.token, 'seo', { ...ok, metaPixelId: '12ab' })).status).toBe(400);
    expect((await put(admin.token, 'seo', { ...ok, extra: 1 })).status).toBe(400);
    expect((await put(admin.token, 'seo', ok)).body.data.seo).toMatchObject({ title: ok.title, ga4Id: 'G-ABC123XYZ9', metaPixelId: '123456789012345' });
    const pub = (await api().get('/api/v1/settings/public')).body.data;
    expect(pub.seo).toMatchObject({ title: ok.title, description: ok.description, ogImage: '/images/og.jpg' });
    expect(pub.analytics).toEqual({ ga4Id: 'G-ABC123XYZ9', metaPixelId: '123456789012345' });
    // clearing the IDs switches tracking off
    await put(admin.token, 'seo', { ...ok, ga4Id: '', metaPixelId: '' });
    expect((await api().get('/api/v1/settings/public')).body.data.analytics).toEqual({ ga4Id: null, metaPixelId: null });
    expect(await AuditLog.countDocuments({ action: 'settings.seo.update' })).toBe(2);
  });
  it('exposes real approved-review ratings on products (and nothing invented)', async () => {
    await shop();
    const p = (await api().get('/api/v1/products/hair-oil')).body.data.product;
    expect(p.ratingCount ?? 0).toBe(0);
    expect(p.ratingAverage ?? 0).toBe(0);
  });
});
