'use client';

import { createClient } from '@/lib/supabaseClient';
import type { LabImage } from './types';

const BUCKET = 'carousel-lab';
const MAX_DIM = 1620;
const QUALITY = 0.82;

/** Downscale + re-encode to JPEG; returns { base64 (no prefix), aspect w/h }. */
export async function compressToBase64(file: File): Promise<{ base64: string; aspect: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const jpeg = canvas.toDataURL('image/jpeg', QUALITY);
  return { base64: jpeg.split(',')[1], aspect: w / h };
}

/**
 * Upload an image to the NEW `carousel-lab` bucket at
 * `<uid>/<projectId>/<slideId>-<index>-<rand>.jpg`. Falls back to inline base64
 * (still persisted in the slide JSON) if storage is unavailable.
 */
export async function uploadLabImage(
  file: File,
  ctx: { projectId: string; slideId: string; index: number },
): Promise<LabImage> {
  const { base64, aspect } = await compressToBase64(file);
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { base64, aspect, url: null, storagePath: null };

    const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${user.id}/${ctx.projectId}/${ctx.slideId}-${ctx.index}-${rand}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bin, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      console.warn('[carousel-lab] storage upload failed, using inline base64:', error.message);
      return { base64, aspect, url: null, storagePath: null };
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // Keep base64 too so export never needs a network fetch (avoids canvas taint).
    return { storagePath: path, url: pub.publicUrl, base64, aspect };
  } catch (e) {
    console.warn('[carousel-lab] upload exception, using inline base64:', e);
    return { base64, aspect, url: null, storagePath: null };
  }
}
