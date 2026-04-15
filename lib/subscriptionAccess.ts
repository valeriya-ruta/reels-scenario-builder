/**
 * Gate for app routes: `access_expires_at === null` means "no expiry" only while {@link phase} is `trial`.
 * For discounted/full (and any non-trial phase with access), a missing expiry denies access so
 * inconsistent rows (e.g. cancelled with NULL) cannot bypass the gate.
 */
export type SubscriptionGateRow = {
  has_access: boolean | null;
  access_expires_at: string | null;
  phase: string | null;
} | null;

export function subscriptionAllowsAppAccess(sub: SubscriptionGateRow): boolean {
  if (!sub?.has_access) return false;

  const phase = sub.phase ?? '';

  if (phase === 'pending_verify' || phase === 'cancelled') {
    return false;
  }

  if (phase === 'trial') {
    if (sub.access_expires_at == null) return true;
    return new Date(sub.access_expires_at) > new Date();
  }

  if (sub.access_expires_at == null) return false;
  return new Date(sub.access_expires_at) > new Date();
}
