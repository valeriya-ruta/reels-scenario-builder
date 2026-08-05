import 'server-only';
import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { IS_PRO_EDITION } from '@/lib/pro/edition';

export type OperatorContext = {
  user: User | null;
  /** True only when the signed-in profile carries role='operator' AND this is the Pro edition. */
  isOperator: boolean;
};

/**
 * Resolves whether the current request belongs to a Pro operator. Cached per
 * request (React cache) so the many read paths that scope by project don't each
 * pay a round-trip. Non-operators (and the customer edition) get isOperator=false
 * and therefore see the app behave exactly as vanilla Ruta.
 */
export const getOperatorContext = cache(async (): Promise<OperatorContext> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, isOperator: false };
  if (!IS_PRO_EDITION) return { user, isOperator: false };

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return { user, isOperator: (data?.role ?? null) === 'operator' };
});

export async function isOperator(): Promise<boolean> {
  return (await getOperatorContext()).isOperator;
}
