import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import {
  subscriptionAllowsAppAccess,
  subscriptionNeedsCardVerify,
} from '@/lib/subscriptionAccess';
import SubscribeClient from './SubscribeClient';

export default async function SubscribePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/');
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('has_access, access_expires_at, phase, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!subscriptionNeedsCardVerify(sub)) {
    redirect('/dashboard');
  }

  if (subscriptionAllowsAppAccess(sub)) {
    redirect('/dashboard');
  }

  return <SubscribeClient />;
}
