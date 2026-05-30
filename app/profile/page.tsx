import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { subscriptionAllowsAppAccess } from '@/lib/subscriptionAccess';
import ProfileClient, { type ProfileSubscription } from '@/components/profile/ProfileClient';

type SubscriptionRow = {
  has_access: boolean | null;
  access_expires_at: string | null;
  phase: string | null;
  status: string | null;
  is_founder: boolean | null;
  plan_price: number | null;
  plan: string | null;
  next_billing_date: string | null;
  currency: string | null;
};

function planDisplayName(sub: SubscriptionRow): string {
  if (sub.is_founder || Number(sub.plan_price) === 5) return 'Founding tier';
  if (Number(sub.plan_price) >= 10) return 'Standard';
  const p = (sub.plan ?? '').toLowerCase();
  if (p === 'founding') return 'Founding tier';
  if (p === 'standard') return 'Standard';
  return 'Тариф';
}

function priceLabel(sub: SubscriptionRow): string {
  const amount = Number(sub.plan_price);
  if (!Number.isFinite(amount) || amount <= 0) return 'ціну зафіксовано';
  const symbol = (sub.currency ?? 'USD') === 'USD' ? '$' : '';
  return `${symbol}${amount}/міс · ціну зафіксовано`;
}

function nextChargeLabel(sub: SubscriptionRow): string | null {
  const raw = sub.next_billing_date ?? sub.access_expires_at;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
  return `Наступне списання: ${formatted}`;
}

export default async function ProfilePage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  const supabase = await createServerSupabaseClient();

  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle<{ display_name: string | null }>(),
    supabase
      .from('subscriptions')
      .select(
        'has_access, access_expires_at, phase, status, is_founder, plan_price, plan, next_billing_date, currency',
      )
      .eq('user_id', user.id)
      .maybeSingle<SubscriptionRow>(),
  ]);

  const metadata = user.user_metadata ?? {};
  const displayName =
    profile?.display_name ||
    (typeof metadata.full_name === 'string' ? metadata.full_name : '') ||
    '';
  const instagramHandle =
    typeof metadata.instagram_handle === 'string' ? metadata.instagram_handle : '';
  const avatarUrl = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : '';

  const hasActivePlan = !!sub && subscriptionAllowsAppAccess(sub);
  const subscription: ProfileSubscription | null = hasActivePlan
    ? {
        planName: planDisplayName(sub!),
        priceLabel: priceLabel(sub!),
        nextChargeLabel: nextChargeLabel(sub!),
      }
    : null;

  return (
    <ProfileClient
      userId={user.id}
      initialDisplayName={displayName}
      email={user.email ?? ''}
      initialInstagramHandle={instagramHandle}
      initialAvatarUrl={avatarUrl}
      subscription={subscription}
    />
  );
}
