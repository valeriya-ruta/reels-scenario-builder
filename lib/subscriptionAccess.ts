/**
 * App access gate. Uses `status` when present (founder billing); falls back to legacy `phase`.
 * past_due / suspended: always allow product access (payment recovery is separate).
 */
export type SubscriptionGateRow = {
  has_access: boolean | null;
  access_expires_at: string | null;
  phase: string | null;
  status?: string | null;
} | null;

function accessFromLegacyPhase(sub: NonNullable<SubscriptionGateRow>): boolean {
  if (!sub.has_access) return false;
  const phase = sub.phase ?? '';
  if (phase === 'pending_verify' || phase === 'cancelled') return false;
  if (phase === 'trial') {
    if (sub.access_expires_at == null) return true;
    return new Date(sub.access_expires_at) > new Date();
  }
  if (sub.access_expires_at == null) return false;
  return new Date(sub.access_expires_at) > new Date();
}

/**
 * True when the user should see /subscribe (needs WayForPay card verify).
 * False once they are past `pending_verify` (trial, paid, etc.).
 */
export function subscriptionNeedsCardVerify(sub: SubscriptionGateRow): boolean {
  if (!sub) return true;

  const status = sub.status;
  if (status === 'trialing' || status === 'active' || status === 'past_due' || status === 'suspended') {
    return false;
  }
  if (status === 'pending_verify' || status === 'canceled') {
    return true;
  }

  const phase = sub.phase ?? '';
  if (phase === 'trial' || phase === 'discounted' || phase === 'full') {
    return false;
  }
  return phase === 'pending_verify' || phase === 'cancelled' || phase === '';
}

export function subscriptionAllowsAppAccess(sub: SubscriptionGateRow): boolean {
  if (!sub) return false;

  const status = sub.status;

  if (status == null || status === '') {
    return accessFromLegacyPhase(sub);
  }

  if (status === 'past_due' || status === 'suspended') {
    return true;
  }

  if (status === 'pending_verify' || status === 'canceled') {
    return false;
  }

  // Card verified — full app access (avoid mismatch if has_access / expiry rows lag webhook)
  if (status === 'trialing' || status === 'active') {
    return true;
  }

  return accessFromLegacyPhase(sub);
}
