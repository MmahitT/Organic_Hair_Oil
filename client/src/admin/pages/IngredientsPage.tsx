import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from '@/lib/zod';
import { ApiError } from '@/lib/api';
import { adminFetch } from '../auth';
import { Alert, Btn, Card, Field, Input, Textarea } from '../ui';

interface Ing { _id: string; name: string; nameBn?: string; description?: string; isActive: boolean }

const schema = z.object({ name: z.string().trim().min(2, 'At least 2 characters').max(80), nameBn: z.string().trim().max(80).optional(), description: z.string().trim().max(500).optional() });
type Values = z.infer<typeof schema>;

export default function IngredientsPage() {
  const [items, setItems] = useState<Ing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema) });

  const load = useCallback(async () => {
    try { setItems((await adminFetch<{ items: Ing[] }>('/admin/ingredients')).data.items); } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to load'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = handleSubmit(async (v) => {
    setError(null);
    try {
      await adminFetch('/admin/ingredients', { method: 'POST', body: { name: v.name, ...(v.nameBn ? { nameBn: v.nameBn } : {}), ...(v.description ? { description: v.description } : {}) } });
      reset({ name: '', nameBn: '', description: '' }); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed to add'); }
  });
  const deactivate = async (id: string) => {
    try { await adminFetch(`/admin/ingredients/${id}`, { method: 'DELETE' }); await load(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed'); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-3xl font-bold">Ingredients</h1>
      <Alert tone="info">Only add ingredients you have confirmed. Link them to a product in the product editor, then they appear on the website.</Alert>
      {error && <Alert>{error}</Alert>}
      <Card title="Add ingredient">
        <form onSubmit={add} noValidate className="grid gap-3 sm:grid-cols-2">
          <Field label="Name (English)" error={errors.name?.message}><Input {...register('name')} /></Field>
          <Field label="Name (Bangla)" error={errors.nameBn?.message}><Input {...register('nameBn')} /></Field>
          <Field label="Description" className="sm:col-span-2" error={errors.description?.message}><Textarea {...register('description')} /></Field>
          <div className="sm:col-span-2"><Btn type="submit" disabled={isSubmitting}>Add ingredient</Btn></div>
        </form>
      </Card>
      <Card title="Active ingredients">
        {items === null && <p role="status" className="py-4 text-center text-charcoal-soft">Loading…</p>}
        {items && items.filter((i) => i.isActive).length === 0 && <p className="py-4 text-center text-charcoal-soft">No ingredients yet.</p>}
        <ul className="divide-y divide-sage/40">
          {items?.filter((i) => i.isActive).map((i) => (
            <li key={i._id} className="flex items-center justify-between gap-3 py-3">
              <div><p className="font-semibold">{i.name}{i.nameBn && <span className="font-normal text-charcoal-soft"> · {i.nameBn}</span>}</p>{i.description && <p className="text-sm text-charcoal-soft">{i.description}</p>}</div>
              <Btn tone="ghost" aria-label={`Remove ${i.name}`} onClick={() => void deactivate(i._id)}><Trash2 aria-hidden className="h-4 w-4 text-danger" /></Btn>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
