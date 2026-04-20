import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { subscriptionAllowsAppAccess, type SubscriptionGateRow } from '@/lib/subscriptionAccess';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select(
      'phase, status, has_access, access_expires_at, phase_ends_at, trial_end, next_billing_date, current_amount, plan_price, is_founder',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  const gate: SubscriptionGateRow = sub
    ? {
        has_access: sub.has_access,
        access_expires_at: sub.access_expires_at,
        phase: sub.phase,
        status: (sub as { status?: string }).status ?? null,
      }
    : null;

  const { data: latestPay } = await supabase
    .from('payments')
    .select('card_pan')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    phase: sub?.phase ?? null,
    status: (sub as { status?: string })?.status ?? null,
    hasAccess: subscriptionAllowsAppAccess(gate),
    accessExpiresAt: sub?.access_expires_at ?? null,
    phaseEndsAt: sub?.phase_ends_at ?? null,
    trialEnd: (sub as { trial_end?: string })?.trial_end ?? null,
    nextBillingDate: (sub as { next_billing_date?: string })?.next_billing_date ?? null,
    currentAmount: sub?.current_amount != null ? Number(sub.current_amount) : null,
    planPrice: (sub as { plan_price?: number })?.plan_price != null ? Number((sub as { plan_price?: number }).plan_price) : null,
    isFounder: (sub as { is_founder?: boolean })?.is_founder ?? null,
    cardPan: latestPay?.card_pan ?? null,
  });
}
