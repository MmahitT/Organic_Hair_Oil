import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Cloudinary signed-upload signature: SHA-1 of the alphabetically sorted "key=value" params joined by "&",
 * with the API secret appended. The secret never leaves the server; the browser only receives the signature.
 */
export function cloudinarySignature(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

export const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,avif';

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

export function signUpload() {
  if (!isCloudinaryConfigured()) return null;
  const timestamp = Math.floor(Date.now() / 1000);
  // Everything the browser sends that is listed here is covered by the signature, so it cannot be changed
  // (folder and allowed file types are enforced by Cloudinary, not by trusting the client).
  const params = { allowed_formats: ALLOWED_FORMATS, folder: `${env.CLOUDINARY_UPLOAD_FOLDER}/products`, timestamp };
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    ...params,
    signature: cloudinarySignature(params, env.CLOUDINARY_API_SECRET!),
  };
}
