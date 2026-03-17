import { createServerSupabaseClient } from './supabaseServer';

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { user, error };
}

export async function requireAuth() {
  const { user, error } = await getCurrentUser();
  
  if (error || !user) {
    return null;
  }
  
  return user;
}
