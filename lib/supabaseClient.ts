'use client';

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // These runtime checks help surface misconfiguration early in development.
  // In production, you may want to handle this differently (e.g. error boundary).
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase env vars are not set. Define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
  );
}

export function createClient() {
  return createBrowserClient(supabaseUrl ?? '', supabaseAnonKey ?? '');
}

