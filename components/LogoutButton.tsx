'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="self-center rounded px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900"
    >
      Вийти
    </button>
  );
}
