'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { ACTIVE_PROJECT_COOKIE, ALL_SENTINEL } from '@/lib/pro/activeProject';
import { getOperatorContext } from '@/lib/pro/operator';
import {
  createProProject,
  updateProProject,
  deleteProProject,
  getProProject,
} from '@/lib/pro/projects';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { regenerateShareLink, revokeShareLink, ensureShareLink } from '@/lib/pro/share';
import type { ProProject } from '@/lib/pro/types';

const YEAR = 60 * 60 * 24 * 365;

/** Pin the whole app to a blogger (or 'all' for the aggregated dashboard). */
export async function setActiveProjectAction(value: string): Promise<{ ok: boolean }> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return { ok: false };

  let cookieValue = ALL_SENTINEL;
  if (value && value !== ALL_SENTINEL) {
    const project = await getProProject(value);
    if (!project) return { ok: false };
    cookieValue = project.id;
  }

  const store = await cookies();
  store.set(ACTIVE_PROJECT_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: YEAR,
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function createBloggerAction(input: {
  name: string;
  color: string;
  emoji?: string | null;
}): Promise<{ ok: true; project: ProProject } | { ok: false }> {
  const project = await createProProject(input);
  if (!project) return { ok: false };
  // Newly-created blogger becomes the active context immediately.
  const store = await cookies();
  store.set(ACTIVE_PROJECT_COOKIE, project.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: YEAR,
  });
  revalidatePath('/', 'layout');
  return { ok: true, project };
}

export async function updateBloggerAction(
  id: string,
  patch: { name?: string; color?: string; emoji?: string | null },
): Promise<{ ok: boolean }> {
  const ok = await updateProProject(id, patch);
  revalidatePath('/', 'layout');
  return { ok };
}

export async function deleteBloggerAction(id: string): Promise<{ ok: boolean }> {
  const ok = await deleteProProject(id);
  // If the deleted blogger was active, drop back to the aggregate.
  const store = await cookies();
  if (store.get(ACTIVE_PROJECT_COOKIE)?.value === id) {
    store.set(ACTIVE_PROJECT_COOKIE, ALL_SENTINEL, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: YEAR,
    });
  }
  revalidatePath('/', 'layout');
  return { ok };
}

export async function saveProBrandAction(
  projectId: string,
  payload: {
    theme?: string;
    vibe?: string;
    favColorHex?: string | null;
    colorLightBg?: string | null;
    colorDarkBg?: string | null;
    colorAccent1?: string | null;
    colorAccent2?: string | null;
    fontId?: string | null;
    accentStyle?: string | null;
    brandMemory?: string | null;
  },
): Promise<{ ok: boolean }> {
  const { user, isOperator } = await getOperatorContext();
  if (!user || !isOperator) return { ok: false };
  // Ownership: the project must belong to this operator.
  const project = await getProProject(projectId);
  if (!project) return { ok: false };

  const supabase = await createServerSupabaseClient();
  const row: Record<string, unknown> = {
    project_id: projectId,
    owner_user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (payload.theme !== undefined) row.theme = payload.theme;
  if (payload.vibe !== undefined) row.vibe = payload.vibe;
  if (payload.favColorHex !== undefined) row.fav_color_hex = payload.favColorHex;
  if (payload.colorLightBg !== undefined) row.color_light_bg = payload.colorLightBg;
  if (payload.colorDarkBg !== undefined) row.color_dark_bg = payload.colorDarkBg;
  if (payload.colorAccent1 !== undefined) row.color_accent1 = payload.colorAccent1;
  if (payload.colorAccent2 !== undefined) row.color_accent2 = payload.colorAccent2;
  if (payload.fontId !== undefined) row.font_id = payload.fontId;
  if (payload.accentStyle !== undefined) row.accent_style = payload.accentStyle;
  if (payload.brandMemory !== undefined) row.brand_memory = payload.brandMemory;

  const { error } = await supabase
    .from('pro_project_brand_settings')
    .upsert(row, { onConflict: 'project_id' });
  if (error) {
    console.error('[pro] saveProBrandAction failed', error.message);
    return { ok: false };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
}

// --- Client share link ------------------------------------------------------

export async function ensureShareLinkAction(projectId: string) {
  const link = await ensureShareLink(projectId);
  revalidatePath('/', 'layout');
  return link ? { ok: true as const, token: link.token } : { ok: false as const };
}

export async function regenerateShareLinkAction(projectId: string) {
  const link = await regenerateShareLink(projectId);
  revalidatePath('/', 'layout');
  return link ? { ok: true as const, token: link.token } : { ok: false as const };
}

export async function revokeShareLinkAction(projectId: string) {
  const ok = await revokeShareLink(projectId);
  revalidatePath('/', 'layout');
  return { ok };
}
