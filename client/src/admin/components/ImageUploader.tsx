import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { adminFetch } from '../auth';
import { Alert, Btn } from '../ui';

interface Signed { uploadUrl: string; apiKey: string; timestamp: number; folder: string; allowed_formats: string; signature: string }
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Direct browser → Cloudinary upload using a signature from our API. The API secret never reaches the browser.
 * When uploads are not configured (no Cloudinary account yet) the API answers 503 and admins can paste image URLs.
 */
export function ImageUploader({ onUploaded }: { onUploaded: (img: { url: string; publicId: string }) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return setError('Please choose a JPG, PNG, WebP or AVIF image.');
    if (file.size > MAX_BYTES) return setError('Image is larger than 5 MB. Please choose a smaller file.');
    setBusy(true);
    try {
      const s = (await adminFetch<Signed>('/admin/uploads/sign', { method: 'POST' })).data;
      const fd = new FormData();
      fd.append('file', file); fd.append('api_key', s.apiKey); fd.append('timestamp', String(s.timestamp));
      fd.append('signature', s.signature); fd.append('folder', s.folder); fd.append('allowed_formats', s.allowed_formats);
      const res = await fetch(s.uploadUrl, { method: 'POST', body: fd });
      const json = (await res.json()) as { secure_url?: string; public_id?: string; error?: { message: string } };
      if (!res.ok || !json.secure_url || !json.public_id) throw new Error(json.error?.message ?? 'Upload failed');
      onUploaded({ url: json.secure_url, publicId: json.public_id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed');
    } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };

  return (
    <div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" aria-label="Upload image file" onChange={(e) => void onFile(e.target.files?.[0])} />
      <Btn tone="secondary" disabled={busy} onClick={() => input.current?.click()}><ImagePlus aria-hidden className="h-4 w-4" />{busy ? 'Uploading…' : 'Upload image'}</Btn>
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </div>
  );
}
