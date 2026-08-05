import 'server-only';
import { nanoid } from 'nanoid';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { getOperatorContext } from '@/lib/pro/operator';

export type ShareIdea = { id: string; title: string; content: string };
export type ShareDecision = 'approved' | 'rejected';

export type ShareLink = {
  id: string;
  projectId: string;
  token: string;
  revoked: boolean;
  ideas: ShareIdea[];
  decisions: Record<string, ShareDecision>;
  projectName: string;
  projectColor: string;
  projectEmoji: string | null;
  createdAt: string;
  updatedAt: string;
};

type ShareRow = {
  id: string;
  project_id: string;
  token: string;
  revoked: boolean;
  ideas_snapshot: ShareIdea[];
  decisions: Record<string, ShareDecision>;
  project_name: string | null;
  project_color: string | null;
  project_emoji: string | null;
  created_at: string;
  updated_at: string;
};

const SHARE_COLS =
  'id,project_id,token,revoked,ideas_snapshot,decisions,project_name,project_color,project_emoji,created_at,updated_at';

function rowToLink(row: ShareRow): ShareLink {
  return {
    id: row.id,
    projectId: row.project_id,
    token: row.token,
    revoked: row.revoked,
    ideas: Array.isArray(row.ideas_snapshot) ? row.ideas_snapshot : [],
    decisions: row.decisions ?? {},
    projectName: row.project_name ?? 'Блогер',
    projectColor: row.project_color ?? '#6366f1',
    projectEmoji: row.project_emoji,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Freeze the current ideas of a project into the share-link shape. */
async function snapshotIdeas(projectId: string): Promise<ShareIdea[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('ideas')
    .select('id,title,content')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .returns<{ id: string; title: string | null; content: string | null }[]>();
  return (data ?? []).map((r) => ({
    id: r.id,
    title: (r.title ?? '').trim(),
    content: (r.content ?? '').trim(),
  }));
}

/** The operator's existing (non-revoked) share link for a project, if any. */
export async function getShareLinkForProject(projectId: string): Promise<ShareLink | null> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('pro_share_links')
    .select(SHARE_COLS)
    .eq('project_id', projectId)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<ShareRow>();
  return data ? rowToLink(data) : null;
}

/**
 * Create a fresh share link for a project (revoking any previous one, which
 * invalidates the old token), snapshotting the current ideas. Returns the new link.
 */
export async function regenerateShareLink(projectId: string): Promise<ShareLink | null> {
  const { user, isOperator } = await getOperatorContext();
  if (!user || !isOperator) return null;
  const supabase = await createServerSupabaseClient();

  // Revoke every prior link for this project → old tokens stop resolving.
  await supabase
    .from('pro_share_links')
    .update({ revoked: true, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('revoked', false);

  // Denormalize the blogger's display fields so the no-login client page can
  // brand itself without reading owner-only pro_projects.
  const { data: proj } = await supabase
    .from('pro_projects')
    .select('name,color,emoji')
    .eq('id', projectId)
    .maybeSingle<{ name: string; color: string; emoji: string | null }>();

  const ideas = await snapshotIdeas(projectId);
  const token = nanoid(24);
  const { data, error } = await supabase
    .from('pro_share_links')
    .insert({
      project_id: projectId,
      owner_user_id: user.id,
      token,
      ideas_snapshot: ideas,
      decisions: {},
      project_name: proj?.name ?? null,
      project_color: proj?.color ?? null,
      project_emoji: proj?.emoji ?? null,
    })
    .select(SHARE_COLS)
    .single<ShareRow>();
  if (error || !data) {
    console.error('[pro] regenerateShareLink failed', error?.message);
    return null;
  }
  return rowToLink(data);
}

/** Ensure a link exists (create one on first share), else return the existing one. */
export async function ensureShareLink(projectId: string): Promise<ShareLink | null> {
  const existing = await getShareLinkForProject(projectId);
  if (existing) return existing;
  return regenerateShareLink(projectId);
}

export async function revokeShareLink(projectId: string): Promise<boolean> {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return false;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from('pro_share_links')
    .update({ revoked: true, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('revoked', false);
  return !error;
}

// --- Public (no-login) side -------------------------------------------------

/** Read a share link by its token via the anon client (public RLS by token). */
export async function getShareByToken(token: string): Promise<ShareLink | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('pro_share_links')
    .select(SHARE_COLS)
    .eq('token', token)
    .eq('revoked', false)
    .maybeSingle<ShareRow>();
  return data ? rowToLink(data) : null;
}

/**
 * Record a client's approve/reject on one idea. Anon write allowed by the
 * token-scoped RLS UPDATE policy; only `decisions` is mutated.
 */
export async function recordDecision(
  token: string,
  ideaId: string,
  decision: ShareDecision,
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('pro_share_links')
    .select('id,decisions,ideas_snapshot')
    .eq('token', token)
    .eq('revoked', false)
    .maybeSingle<{ id: string; decisions: Record<string, ShareDecision>; ideas_snapshot: ShareIdea[] }>();
  if (!data) return false;
  // Only accept decisions on ideas that are actually in the shared snapshot.
  const known = new Set((data.ideas_snapshot ?? []).map((i) => i.id));
  if (!known.has(ideaId)) return false;
  const decisions = { ...(data.decisions ?? {}), [ideaId]: decision };
  const { error } = await supabase
    .from('pro_share_links')
    .update({ decisions, updated_at: new Date().toISOString() })
    .eq('token', token)
    .eq('revoked', false);
  return !error;
}
