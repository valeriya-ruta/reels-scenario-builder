import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { CalendarDays } from 'lucide-react';

export default async function PlanPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
        <CalendarDays className="h-7 w-7" />
      </div>
      <h1 className="font-display mt-5 text-2xl font-semibold text-zinc-900">План</h1>
      <p className="mt-2 text-sm leading-normal text-zinc-600">
        Контент-календар скоро зʼявиться тут. Ми працюємо над плануванням публікацій.
      </p>
      <span className="mt-4 rounded-full bg-[color:var(--surface2)] px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-600">
        Скоро
      </span>
    </div>
  );
}
