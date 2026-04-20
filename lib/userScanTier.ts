import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { subscriptionAllowsAppAccess } from '@/lib/subscriptionAccess';

/**
 * Paid scan tier when the user has an active subscription row that grants app access.
 * No row or pending-only → free tier limits.
 */
export async function userHasPaidScanAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('subscriptions')
    .select('has_access, access_expires_at, phase, status')
    .eq('user_id', userId)
    .maybeSingle();
  return subscriptionAllowsAppAccess(data);
}
