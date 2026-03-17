import { getCurrentUser } from '@/lib/auth';
import LogoutButton from './LogoutButton';

export default async function Header() {
  const { user } = await getCurrentUser();

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <a href="/projects" className="text-sm font-semibold tracking-wide text-zinc-800 hover:text-zinc-900">
          Планувальник Рілів
        </a>
        {user && <LogoutButton />}
      </div>
    </header>
  );
}
