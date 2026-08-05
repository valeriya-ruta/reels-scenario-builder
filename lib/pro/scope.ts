import 'server-only';
import { cache } from 'react';
import { getOperatorContext } from '@/lib/pro/operator';
import { getActiveProjectId } from '@/lib/pro/activeProject';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

/**
 * How the current request should scope content reads/writes.
 * - personal:     non-operator / customer edition — behave exactly as today (user_id only).
 * - project:      operator pinned into one blogger — scope everything to that project_id.
 * - allProjects:  operator in "All / Dashboard" — aggregate across every blogger (project_id NOT NULL).
 */
export type ProScope =
  | { kind: 'personal' }
  | { kind: 'project'; projectId: string }
  | { kind: 'allProjects' };

/** The set of project ids the operator actually owns (RLS-scoped). Cached per request. */
const ownedProjectIds = cache(async (): Promise<Set<string>> => {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from('pro_projects').select('id');
  return new Set((data ?? []).map((r: { id: string }) => r.id));
});

export const getProScope = cache(async (): Promise<ProScope> => {
  const { isOperator } = await getOperatorContext();
  if (!isOperator) return { kind: 'personal' };
  const pid = await getActiveProjectId();
  if (!pid) return { kind: 'allProjects' };
  // Only honor a pinned project the operator genuinely owns; otherwise fall back
  // to the aggregate so a stale/foreign cookie never stamps foreign project_ids.
  const owned = await ownedProjectIds();
  if (!owned.has(pid)) return { kind: 'allProjects' };
  return { kind: 'project', projectId: pid };
});

/**
 * Apply the active scope to a Supabase query builder that exposes a `project_id`
 * column. Personal scope is a no-op (unchanged customer behavior).
 */
export function applyScope<T>(query: T, scope: ProScope, column = 'project_id'): T {
  const q = query as unknown as {
    eq: (c: string, v: unknown) => T;
    not: (c: string, op: string, v: unknown) => T;
  };
  if (scope.kind === 'project') return q.eq(column, scope.projectId);
  if (scope.kind === 'allProjects') return q.not(column, 'is', null);
  return query;
}

/** The project_id to stamp on a freshly-created content row (null when unscoped). */
export function insertProjectId(scope: ProScope): string | null {
  return scope.kind === 'project' ? scope.projectId : null;
}
