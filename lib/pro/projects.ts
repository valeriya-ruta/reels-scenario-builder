import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getOperatorContext } from '@/lib/pro/operator';
import type { ProBrand, ProProject } from '@/lib/pro/types';

type ProProjectRow = {
  id: string;
  name: string;
  color: string;
  emoji: string | null;
  avatar_url: string | null;
  created_at: string;
};

function rowToProject(row: ProProjectRow): ProProject {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    emoji: row.emoji,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

/** Every blogger owned by the current operator, oldest-first (stable order). */
export async function listProProjects(): Promise<ProProject[]> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pro_projects')
    .select('id,name,color,emoji,avatar_url,created_at')
    .order('created_at', { ascending: true })
    .returns<ProProjectRow[]>();
  if (error || !data) return [];
  return data.map(rowToProject);
}

export async function getProProject(id: string): Promise<ProProject | null> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('pro_projects')
    .select('id,name,color,emoji,avatar_url,created_at')
    .eq('id', id)
    .maybeSingle<ProProjectRow>();
  return data ? rowToProject(data) : null;
}

export async function createProProject(input: {
  name: string;
  color: string;
  emoji?: string | null;
}): Promise<ProProject | null> {
  const { user, isOperator } = await getOperatorContext();
  if (!user || !isOperator) return null;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('pro_projects')
    .insert({
      owner_user_id: user.id,
      name: input.name.trim() || 'Новий блогер',
      color: input.color,
      emoji: input.emoji?.trim() || null,
    })
    .select('id,name,color,emoji,avatar_url,created_at')
    .single<ProProjectRow>();
  if (error || !data) {
    console.error('[pro] createProProject failed', error?.message);
    return null;
  }
  return rowToProject(data);
}

export async function updateProProject(
  id: string,
  patch: { name?: string; color?: string; emoji?: string | null },
): Promise<boolean> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return false;
  const supabase = await createServerSupabaseClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim() || 'Новий блогер';
  if (patch.color !== undefined) update.color = patch.color;
  if (patch.emoji !== undefined) update.emoji = patch.emoji?.trim() || null;
  const { error } = await supabase.from('pro_projects').update(update).eq('id', id);
  if (error) console.error('[pro] updateProProject failed', error.message);
  return !error;
}

export async function deleteProProject(id: string): Promise<boolean> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return false;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from('pro_projects').delete().eq('id', id);
  if (error) console.error('[pro] deleteProProject failed', error.message);
  return !error;
}

// --- Per-project brand style + memory ---------------------------------------

type ProBrandRow = {
  project_id: string;
  theme: string | null;
  vibe: string | null;
  fav_color_hex: string | null;
  color_light_bg: string | null;
  color_dark_bg: string | null;
  color_accent1: string | null;
  color_accent2: string | null;
  font_id: string | null;
  accent_style: string | null;
  brand_memory: string | null;
};

function rowToBrand(row: ProBrandRow): ProBrand {
  return {
    projectId: row.project_id,
    theme: row.theme === 'dark' ? 'dark' : 'light',
    vibe: row.vibe === 'refined' ? 'refined' : 'bold',
    favColorHex: row.fav_color_hex,
    colors: {
      lightBg: row.color_light_bg,
      darkBg: row.color_dark_bg,
      accent1: row.color_accent1,
      accent2: row.color_accent2,
    },
    fontId: row.font_id,
    accentStyle: row.accent_style,
    brandMemory: row.brand_memory,
  };
}

export async function getProProjectBrand(projectId: string): Promise<ProBrand | null> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('pro_project_brand_settings')
    .select(
      'project_id,theme,vibe,fav_color_hex,color_light_bg,color_dark_bg,color_accent1,color_accent2,font_id,accent_style,brand_memory',
    )
    .eq('project_id', projectId)
    .maybeSingle<ProBrandRow>();
  return data ? rowToBrand(data) : null;
}
