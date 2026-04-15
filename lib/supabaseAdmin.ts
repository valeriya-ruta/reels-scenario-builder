import { createClient } from '@supabase/supabase-js';
import { requireServerEnv } from '@/lib/env';

/**
 * Service role — bypasses RLS. Use only in Route Handlers / Cron (never in client components).
 */
export function createServiceRoleClient() {
  const url = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
