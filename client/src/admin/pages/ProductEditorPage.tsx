import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from '@/lib/zod';
import { ApiError } from '@/lib/api';
import { adminFetch } from '../auth';
import { ImageUploader } from '../components/ImageUploader';
import { Alert, Btn, Card, Field, Input, Select, Textarea } from '../ui';

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? undefined : Number(v));
const optInt = z.number().int('Whole numbers only').min(0, 'Cannot be negative').optional();
const urlRx = /^(https:\/\/|\/images\/)/;

const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(120),
  nameBn: z.string().trim().max(120).optional(),
  slug: z.string().trim().toLowerCase().max(80).regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Use lowercase letters, numbers and hyphens').optional(),
  type: z.enum(['simple', 'bundle']),
  shortDescription: z.string().trim().max(300).optional(),
  shortDescriptionBn: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  descriptionBn: z.string().trim().max(5000).optional(),
  visibility: z.enum(['draft', 'published', 'hidden']),
  isFeatured: z.boolean(),
  freeDelivery: z.boolean(),
  forceOutOfStock: z.boolean(),
  allowBackorder: z.boolean(),
  maxPerOrder: z.number().int().min(1).max(100).optional(),
  category: z.string().optional(),
  images: z.array(z.object({ url: z.string().trim().regex(urlRx, 'Must start with https:// or /images/'), alt: z.string().trim().min(1, 'Describe the image').max(200), publicId: z.string().optional(), isPrimary: z.boolean() })).max(12),
  variants: z.array(z.object({
    sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'SKU: 2–40 letters, numbers, - or _'),
    label: z.string().trim().min(1, 'Required').max(40),
    sizeValue: z.number().min(0).optional(),
    sizeUnit: z.enum(['', 'ml', 'g', 'pcs']),
    regularPrice: z.number('Enter a price').int('Whole taka only').min(0).max(1_000_000),
    discountPrice: optInt,
    discountStart: z.string(),
    discountEnd: z.string(),
    lowStockThreshold: optInt,
    isActive: z.boolean(),
    stock: optInt,
    existing: z.boolean(),
    currentStock: z.number(),
  }).refine((v) => v.discountPrice === undefined || v.discountPrice < v.regularPrice, { path: ['discountPrice'], message: 'Must be lower than the regular price' })).min(1, 'Add at least one variant').max(10),
  bundleItems: z.array(z.object({ product: z.string().min(1, 'Choose a product'), sku: z.string().min(1), quantity: z.number().int().min(1).max(10), isGift: z.boolean() })),
  ingredientIds: z.array(z.string()),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(170).optional(),
}).superRefine((v, ctx) => {
  if (v.type === 'bundle' && v.bundleItems.length === 0) ctx.addIssue({ code: 'custom', path: ['bundleItems'], message: 'A bundle needs at least one component' });
  const skus = v.variants.map((x) => x.sku);
  if (new Set(skus).size !== skus.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Each variant needs a different SKU' });
});
type Values = z.infer<typeof schema>;

const emptyVariant = (): Values['variants'][number] => ({ sku: '', label: '', sizeValue: undefined, sizeUnit: '', regularPrice: 0, discountPrice: undefined, discountStart: '', discountEnd: '', lowStockThreshold: 5, isActive: true, stock: 0, existing: false, currentStock: 0 });
const defaults: Values = { name: '', nameBn: '', slug: '', type: 'simple', shortDescription: '', shortDescriptionBn: '', description: '', descriptionBn: '', visibility: 'draft', isFeatured: false, freeDelivery: false, forceOutOfStock: false, allowBackorder: false, maxPerOrder: undefined, category: '', images: [], variants: [emptyVariant()], bundleItems: [], ingredientIds: [], seoTitle: '', seoDescription: '' };

interface ApiProduct {
  _id: string; name: string; nameBn?: string; slug: string; type: 'simple' | 'bundle'; shortDescription?: string; shortDescriptionBn?: string; description?: string; descriptionBn?: string;
  visibility: Values['visibility']; isFeatured: boolean; freeDelivery: boolean; forceOutOfStock: boolean; allowBackorder: boolean; maxPerOrder?: number; category?: string;
  images: { url: string; alt: string; publicId?: string; isPrimary: boolean }[];
  variants: { sku: string; label: string; sizeValue?: number; sizeUnit?: 'ml' | 'g' | 'pcs'; regularPrice: number; discountPrice?: number | null; discountStart?: string; discountEnd?: string; lowStockThreshold: number; isActive: boolean; stock: number }[];
  bundleItems: { product: string; sku: string; quantity: number; isGift: boolean }[];
  ingredients: { ingredient: string; order: number }[]; seo?: { title?: string; description?: string };
}
interface Opt { _id: string; name: string; variants?: { sku: string; label: string }[] }

const fromApi = (p: ApiProduct): Values => ({
  name: p.name, nameBn: p.nameBn ?? '', slug: p.slug, type: p.type,
  shortDescription: p.shortDescription ?? '', shortDescriptionBn: p.shortDescriptionBn ?? '', description: p.description ?? '', descriptionBn: p.descriptionBn ?? '',
  visibility: p.visibility, isFeatured: p.isFeatured, freeDelivery: p.freeDelivery, forceOutOfStock: p.forceOutOfStock, allowBackorder: p.allowBackorder,
  maxPerOrder: p.maxPerOrder ?? undefined, category: p.category ?? '',
  images: p.images.map((i) => ({ url: i.url, alt: i.alt, publicId: i.publicId, isPrimary: i.isPrimary })),
  variants: p.variants.map((v) => ({ sku: v.sku, label: v.label, sizeValue: v.sizeValue ?? undefined, sizeUnit: v.sizeUnit ?? '', regularPrice: v.regularPrice, discountPrice: v.discountPrice ?? undefined, discountStart: v.discountStart?.slice(0, 10) ?? '', discountEnd: v.discountEnd?.slice(0, 10) ?? '', lowStockThreshold: v.lowStockThreshold, isActive: v.isActive, stock: undefined, existing: true, currentStock: v.stock })),
  bundleItems: p.bundleItems.map((b) => ({ product: String(b.product), sku: b.sku, quantity: b.quantity, isGift: b.isGift })),
  ingredientIds: [...p.ingredients].sort((a, b) => a.order - b.order).map((i) => String(i.ingredient)),
  seoTitle: p.seo?.title ?? '', seoDescription: p.seo?.description ?? '',
});

function toBody(v: Values, mode: 'create' | 'edit') {
  const date = (s: string) => (s ? new Date(`${s}T00:00:00.000Z`).toISOString() : null);
  return {
    name: v.name, nameBn: v.nameBn ?? '', ...(v.slug ? { slug: v.slug } : {}),
    ...(mode === 'create' ? { type: v.type } : {}),
    shortDescription: v.shortDescription ?? '', shortDescriptionBn: v.shortDescriptionBn ?? '', description: v.description ?? '', descriptionBn: v.descriptionBn ?? '',
    visibility: v.visibility, isFeatured: v.isFeatured, freeDelivery: v.freeDelivery, forceOutOfStock: v.forceOutOfStock, allowBackorder: v.allowBackorder,
    maxPerOrder: v.maxPerOrder ?? null, category: v.category || null,
    images: v.images.map((i, idx) => ({ url: i.url, alt: i.alt, ...(i.publicId ? { publicId: i.publicId } : {}), isPrimary: i.isPrimary, order: idx })),
    variants: v.variants.map((x) => ({
      sku: x.sku, label: x.label, ...(x.sizeValue !== undefined ? { sizeValue: x.sizeValue } : {}), ...(x.sizeUnit ? { sizeUnit: x.sizeUnit } : {}),
      regularPrice: x.regularPrice, discountPrice: x.discountPrice ?? null, discountStart: date(x.discountStart), discountEnd: date(x.discountEnd),
      ...(x.lowStockThreshold !== undefined ? { lowStockThreshold: x.lowStockThreshold } : {}), isActive: x.isActive,
      ...(mode === 'create' && v.type === 'simple' ? { stock: x.stock ?? 0 } : {}),
    })),
    ...(v.type === 'bundle' ? { bundleItems: v.bundleItems } : {}),
    ingredients: v.ingredientIds.map((id, i) => ({ ingredient: id, order: i })),
    seo: { title: v.seoTitle ?? '', description: v.seoDescription ?? '' },
  };
}

export default function ProductEditorPage() {
  const { id } = useParams();
  const mode = id ? 'edit' : 'create';
  const nav = useNavigate();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { register, control, handleSubmit, watch, reset, setValue, getValues, formState: { errors, isSubmitting, isDirty } } = form;
  const variants = useFieldArray({ control, name: 'variants' });
  const images = useFieldArray({ control, name: 'images' });
  const bundle = useFieldArray({ control, name: 'bundleItems' });

  const [loading, setLoading] = useState(mode === 'edit');
  const [apiErrors, setApiErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<{ slug: string; visibility: string } | null>(null);
  const [ingredients, setIngredients] = useState<Opt[]>([]);
  const [categories, setCategories] = useState<Opt[]>([]);
  const [components, setComponents] = useState<Opt[]>([]);
  const [urlDraft, setUrlDraft] = useState('');

  const type = watch('type');
  const watchedBundle = watch('bundleItems');
  const selectedIngredients = watch('ingredientIds');

  useEffect(() => {
    void (async () => {
      try {
        const [ing, cat, comps] = await Promise.all([
          adminFetch<{ items: (Opt & { isActive: boolean })[] }>('/admin/ingredients'),
          adminFetch<{ items: (Opt & { isActive: boolean })[] }>('/admin/categories'),
          adminFetch<{ items: Opt[] }>('/admin/products', { query: { type: 'simple', limit: 100 } }),
        ]);
        setIngredients(ing.data.items.filter((i) => i.isActive)); setCategories(cat.data.items.filter((c) => c.isActive)); setComponents(comps.data.items);
        if (id) { const p = await adminFetch<{ product: ApiProduct }>(`/admin/products/${id}`); reset(fromApi(p.data.product)); }
      } catch (e) { setApiErrors([e instanceof ApiError ? e.message : 'Failed to load']); }
      finally { setLoading(false); }
    })();
  }, [id, reset]);

  const save = handleSubmit(async (v) => {
    setApiErrors([]); setSaved(null);
    try {
      const body = toBody(v, mode);
      const r = mode === 'create'
        ? await adminFetch<{ product: ApiProduct }>('/admin/products', { method: 'POST', body })
        : await adminFetch<{ product: ApiProduct }>(`/admin/products/${id}`, { method: 'PATCH', body });
      reset(fromApi(r.data.product));
      setSaved({ slug: r.data.product.slug, visibility: r.data.product.visibility });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (mode === 'create') nav(`/admin/products/${r.data.product._id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError) setApiErrors(e.details?.length ? e.details.map((d) => `${d.path}: ${d.message}`) : [e.message]);
      else setApiErrors(['Something went wrong while saving.']);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  const archive = async () => {
    if (!window.confirm('Archive this product? It will disappear from the website. Past orders keep their details.')) return;
    try { await adminFetch(`/admin/products/${id}`, { method: 'DELETE' }); nav('/admin/products', { replace: true }); }
    catch (e) { setApiErrors([e instanceof ApiError ? e.message : 'Failed to archive']); }
  };

  const addImage = (img: { url: string; publicId?: string }) =>
    images.append({ url: img.url, publicId: img.publicId, alt: getValues('name') || '', isPrimary: images.fields.length === 0 });
  const makePrimary = (idx: number) => getValues('images').forEach((_, i) => setValue(`images.${i}.isPrimary`, i === idx, { shouldDirty: true }));

  if (loading) return <p role="status" className="p-8 text-center text-charcoal-soft">Loading…</p>;
  const e = errors;

  return (
    <form onSubmit={save} noValidate className="mx-auto max-w-4xl space-y-5 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Link to="/admin/products" className="text-sm font-semibold text-forest hover:underline">← Products</Link><h1 className="text-3xl font-bold">{mode === 'create' ? 'New product' : 'Edit product'}</h1></div>
        {mode === 'edit' && <Btn tone="ghost" onClick={() => void archive()}><Trash2 aria-hidden className="h-4 w-4 text-danger" /><span className="text-danger">Archive</span></Btn>}
      </div>

      {saved && <Alert tone="success">Saved. {saved.visibility === 'published' ? <>It is live on the website (<a className="font-semibold underline" href="/" target="_blank" rel="noreferrer">view site</a>).</> : <>Status is “{saved.visibility}” — it is <strong>not</strong> visible on the website until you set Visibility to Published.</>}</Alert>}
      {apiErrors.length > 0 && <Alert><p className="font-semibold">Could not save:</p><ul className="list-disc pl-5">{apiErrors.map((m) => <li key={m}>{m}</li>)}</ul></Alert>}

      <Card title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)" error={e.name?.message}><Input {...register('name')} /></Field>
          <Field label="Name (Bangla)" error={e.nameBn?.message}><Input lang="bn" {...register('nameBn')} /></Field>
          <Field label="Web address (slug)" hint="Leave empty to build it from the name. Required if the name has no English letters." error={e.slug?.message}><Input placeholder="e.g. hair-oil" {...register('slug')} /></Field>
          <Field label="Type" hint={mode === 'edit' ? 'Cannot be changed after creation.' : 'A bundle (like the combo) is made of other products.'}>
            <Select disabled={mode === 'edit'} {...register('type')}><option value="simple">Simple product</option><option value="bundle">Bundle</option></Select>
          </Field>
          <Field label="Short description (English)" className="sm:col-span-2" error={e.shortDescription?.message}><Input {...register('shortDescription')} /></Field>
          <Field label="Short description (Bangla)" className="sm:col-span-2" error={e.shortDescriptionBn?.message}><Input lang="bn" {...register('shortDescriptionBn')} /></Field>
          <Field label="Full description (English)" className="sm:col-span-2" hint="Plain text. Blank lines make paragraphs." error={e.description?.message}><Textarea {...register('description')} /></Field>
          <Field label="Full description (Bangla)" className="sm:col-span-2" error={e.descriptionBn?.message}><Textarea lang="bn" {...register('descriptionBn')} /></Field>
          <Field label="Category"><Select {...register('category')}><option value="">— None —</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</Select></Field>
        </div>
      </Card>

      <Card title="Images" actions={<ImageUploader onUploaded={addImage} />}>
        <p className="mb-3 text-sm text-charcoal-soft">The first (primary) image is used on cards and in the cart. A product needs at least one image to be published.</p>
        {images.fields.length === 0 && <p className="mb-3 rounded-lg bg-cream-dark p-4 text-center text-sm text-charcoal-soft">No images yet.</p>}
        <ul className="space-y-3">
          {images.fields.map((f, idx) => (
            <li key={f.id} className="grid items-start gap-3 rounded-lg border border-sage/50 p-3 sm:grid-cols-[72px_1fr_auto]">
              <img src={watch(`images.${idx}.url`)} alt="" className="h-[72px] w-[72px] rounded-lg bg-cream-dark object-contain" />
              <div className="space-y-2">
                <Field label="Image URL" error={e.images?.[idx]?.url?.message}><Input {...register(`images.${idx}.url`)} /></Field>
                <Field label="Description (alt text)" error={e.images?.[idx]?.alt?.message}><Input {...register(`images.${idx}.alt`)} /></Field>
                <label className="flex min-h-9 items-center gap-2 text-sm"><input type="radio" name="primary-image" checked={watch(`images.${idx}.isPrimary`)} onChange={() => makePrimary(idx)} className="h-4 w-4 accent-forest" />Primary image</label>
              </div>
              <div className="flex gap-1 sm:flex-col">
                <Btn tone="ghost" aria-label="Move up" disabled={idx === 0} onClick={() => images.move(idx, idx - 1)}><ArrowUp aria-hidden className="h-4 w-4" /></Btn>
                <Btn tone="ghost" aria-label="Move down" disabled={idx === images.fields.length - 1} onClick={() => images.move(idx, idx + 1)}><ArrowDown aria-hidden className="h-4 w-4" /></Btn>
                <Btn tone="ghost" aria-label="Remove image" onClick={() => { const wasPrimary = getValues(`images.${idx}.isPrimary`); images.remove(idx); if (wasPrimary && getValues('images').length) setValue('images.0.isPrimary', true); }}><Trash2 aria-hidden className="h-4 w-4 text-danger" /></Btn>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <Input aria-label="Paste an image URL" placeholder="Or paste an image URL (https://…)" value={urlDraft} onChange={(ev) => setUrlDraft(ev.target.value)} />
          <Btn tone="secondary" disabled={!urlRx.test(urlDraft.trim())} onClick={() => { addImage({ url: urlDraft.trim() }); setUrlDraft(''); }}><Plus aria-hidden className="h-4 w-4" />Add</Btn>
        </div>
      </Card>

      <Card title={type === 'bundle' ? 'Price' : 'Sizes, prices & stock'} actions={type === 'simple' && <Btn tone="secondary" onClick={() => variants.append(emptyVariant())}><Plus aria-hidden className="h-4 w-4" />Add size</Btn>}>
        {typeof e.variants?.message === 'string' && <div className="mb-3"><Alert>{e.variants.message}</Alert></div>}
        <ul className="space-y-4">
          {variants.fields.map((f, idx) => {
            const ve = e.variants?.[idx];
            const existing = watch(`variants.${idx}.existing`);
            return (
              <li key={f.id} className="rounded-lg border border-sage/50 p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="SKU" hint="Unique stock code" error={ve?.sku?.message}><Input disabled={existing} autoCapitalize="characters" {...register(`variants.${idx}.sku`)} /></Field>
                  <Field label="Size label" hint='e.g. "200 ml"' error={ve?.label?.message}><Input {...register(`variants.${idx}.label`)} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Size" error={ve?.sizeValue?.message}><Input type="number" inputMode="decimal" min={0} step="any" {...register(`variants.${idx}.sizeValue`, { setValueAs: num })} /></Field>
                    <Field label="Unit"><Select {...register(`variants.${idx}.sizeUnit`)}><option value="">—</option><option value="ml">ml</option><option value="g">g</option><option value="pcs">pcs</option></Select></Field>
                  </div>
                  <Field label="Regular price (৳)" error={ve?.regularPrice?.message}><Input type="number" inputMode="numeric" min={0} step={1} {...register(`variants.${idx}.regularPrice`, { setValueAs: num })} /></Field>
                  <Field label="Discount price (৳)" hint="Optional, lower than regular" error={ve?.discountPrice?.message}><Input type="number" inputMode="numeric" min={0} step={1} {...register(`variants.${idx}.discountPrice`, { setValueAs: num })} /></Field>
                  <Field label="Low-stock warning at" error={ve?.lowStockThreshold?.message}><Input type="number" inputMode="numeric" min={0} step={1} {...register(`variants.${idx}.lowStockThreshold`, { setValueAs: num })} /></Field>
                  <Field label="Discount starts" hint="Optional"><Input type="date" {...register(`variants.${idx}.discountStart`)} /></Field>
                  <Field label="Discount ends" hint="Optional"><Input type="date" {...register(`variants.${idx}.discountEnd`)} /></Field>
                  {type === 'simple' && (existing
                    ? <div className="flex flex-col justify-end text-sm"><span className="font-semibold">Stock: {watch(`variants.${idx}.currentStock`)}</span><Link to="/admin/inventory" className="text-forest underline">Change in Inventory</Link></div>
                    : <Field label="Starting stock" error={ve?.stock?.message}><Input type="number" inputMode="numeric" min={0} step={1} {...register(`variants.${idx}.stock`, { setValueAs: num })} /></Field>)}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest" {...register(`variants.${idx}.isActive`)} />Available for sale</label>
                  {variants.fields.length > 1 && !existing && <Btn tone="ghost" onClick={() => variants.remove(idx)}><Trash2 aria-hidden className="h-4 w-4 text-danger" />Remove</Btn>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {type === 'bundle' && (
        <Card title="Bundle contents" actions={<Btn tone="secondary" onClick={() => bundle.append({ product: '', sku: '', quantity: 1, isGift: false })}><Plus aria-hidden className="h-4 w-4" />Add item</Btn>}>
          <p className="mb-3 text-sm text-charcoal-soft">The bundle’s stock is the smallest stock among its parts. Ordering it reduces each part’s stock.</p>
          {typeof e.bundleItems?.message === 'string' && <Alert>{e.bundleItems.message}</Alert>}
          <ul className="space-y-3">
            {bundle.fields.map((f, idx) => {
              const chosen = components.find((c) => c._id === watchedBundle?.[idx]?.product);
              return (
                <li key={f.id} className="grid items-end gap-3 rounded-lg border border-sage/50 p-3 sm:grid-cols-[1fr_1fr_90px_auto_auto]">
                  <Field label="Product" error={e.bundleItems?.[idx]?.product?.message}>
                    <Select {...register(`bundleItems.${idx}.product`, { onChange: (ev) => { const c = components.find((x) => x._id === ev.target.value); setValue(`bundleItems.${idx}.sku`, c?.variants?.[0]?.sku ?? ''); } })}>
                      <option value="">Choose…</option>{components.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Size / SKU"><Select {...register(`bundleItems.${idx}.sku`)}>{(chosen?.variants ?? []).map((v) => <option key={v.sku} value={v.sku}>{v.label} ({v.sku})</option>)}</Select></Field>
                  <Field label="Qty"><Input type="number" min={1} max={10} step={1} {...register(`bundleItems.${idx}.quantity`, { valueAsNumber: true })} /></Field>
                  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest" {...register(`bundleItems.${idx}.isGift`)} />Free gift</label>
                  <Btn tone="ghost" aria-label="Remove item" onClick={() => bundle.remove(idx)}><Trash2 aria-hidden className="h-4 w-4 text-danger" /></Btn>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title="Ingredients">
        {ingredients.length === 0 ? <p className="text-sm text-charcoal-soft">No ingredients added yet. <Link className="font-semibold text-forest underline" to="/admin/ingredients">Add ingredients</Link> first.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {ingredients.map((i) => (
              <li key={i._id}><label className="flex min-h-11 items-center gap-2 rounded-lg border border-sage/50 px-3 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest" checked={selectedIngredients.includes(i._id)} onChange={(ev) => setValue('ingredientIds', ev.target.checked ? [...selectedIngredients, i._id] : selectedIngredients.filter((x) => x !== i._id), { shouldDirty: true })} />{i.name}</label></li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Visibility & delivery">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Visibility" hint="Only “Published” products appear on the website."><Select {...register('visibility')}><option value="draft">Draft (hidden)</option><option value="published">Published</option><option value="hidden">Hidden</option></Select></Field>
          <Field label="Max per order" hint="Optional (website cap is 10)" error={e.maxPerOrder?.message}><Input type="number" inputMode="numeric" min={1} step={1} {...register('maxPerOrder', { setValueAs: num })} /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest" {...register('isFeatured')} />Featured offer (shown in the hero and offer section)</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest" {...register('freeDelivery')} />Orders containing this product get free delivery</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest" {...register('forceOutOfStock')} />Mark as out of stock</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-forest" {...register('allowBackorder')} />Allow ordering when out of stock</label>
        </div>
      </Card>

      <Card title="Search engine (SEO)">
        <div className="grid gap-4">
          <Field label="Page title" hint="Up to 70 characters" error={e.seoTitle?.message}><Input {...register('seoTitle')} /></Field>
          <Field label="Page description" hint="Up to 170 characters" error={e.seoDescription?.message}><Textarea className="min-h-20" {...register('seoDescription')} /></Field>
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-sage/50 bg-white/95 px-4 py-3 backdrop-blur lg:left-60">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <p className="text-sm text-charcoal-soft">{isDirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>
          <Btn type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}</Btn>
        </div>
      </div>
    </form>
  );
}
