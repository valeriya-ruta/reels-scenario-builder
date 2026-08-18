'use client';

import { createClient } from '@/lib/supabaseClient';

/**
 * A picture, pasted.
 *
 * Ctrl+V from wherever the reference was found — a browser tab, a screenshot, a
 * chat — straight onto the block. A file picker would mean saving the image
 * first, finding it again, and picking it, which is enough friction that the
 * reference simply never gets attached.
 *
 * The upload goes to the `reel-refs` bucket under `<user-id>/<reel-id>/`, which
 * is what the storage policy checks (migration 045). Public read, because the
 * person opening the share link has no account and still has to see it.
 */

const MAX_BYTES = 10 * 1024 * 1024;

export type PasteResult = { ok: true; url: string } | { ok: false; error: string };

/** Image files on a clipboard event, if any. Empty for a normal text paste. */
export function imagesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) out.push(file);
  }
  return out;
}

function extensionFor(type: string): string {
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('avif')) return 'avif';
  return 'jpg';
}

export async function uploadPastedImage(file: File, reelId: string): Promise<PasteResult> {
  if (!file.type.startsWith('image/')) return { ok: false, error: 'Це не зображення.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'Зображення завелике (більше 10 МБ).' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The path IS the permission check, so an anonymous paste cannot even name a
  // folder the policy would accept.
  if (!user) return { ok: false, error: 'Треба увійти в акаунт.' };

  const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${extensionFor(file.type)}`;
  const path = `${user.id}/${reelId}/${name}`;

  const { error } = await supabase.storage.from('reel-refs').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    console.error('[reel-refs] upload failed:', error.message);
    return { ok: false, error: 'Не вдалося завантажити зображення.' };
  }

  const { data } = supabase.storage.from('reel-refs').getPublicUrl(path);
  return data?.publicUrl
    ? { ok: true, url: data.publicUrl }
    : { ok: false, error: 'Не вдалося отримати посилання.' };
}
