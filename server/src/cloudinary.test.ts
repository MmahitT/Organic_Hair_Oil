import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('cloudinary signing', () => {
  it('matches the signature example from Cloudinary documentation', async () => {
    const { cloudinarySignature } = await import('./utils/cloudinary.js');
    const sig = cloudinarySignature({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: 1315060510 }, 'abcd');
    expect(sig).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
  it('signs only server-chosen params and never exposes the secret', async () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo');
    vi.stubEnv('CLOUDINARY_API_KEY', '123456');
    vi.stubEnv('CLOUDINARY_API_SECRET', 'super-secret-value');
    vi.resetModules();
    const { signUpload, cloudinarySignature } = await import('./utils/cloudinary.js');
    const s = signUpload()!;
    expect(s.folder).toBe('beauty-organic/products');
    expect(s.allowed_formats).toBe('jpg,jpeg,png,webp,avif');
    expect(s.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(JSON.stringify(s)).not.toContain('super-secret-value');
    expect(s.signature).toBe(cloudinarySignature({ allowed_formats: s.allowed_formats, folder: s.folder, timestamp: s.timestamp }, 'super-secret-value'));
  });
  it('returns null when credentials are missing', async () => {
    const { signUpload } = await import('./utils/cloudinary.js');
    expect(signUpload()).toBeNull();
  });
});
