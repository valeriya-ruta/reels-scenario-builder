import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';

export default async function SettingsPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-black">Налаштування</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        Тут незабаром з’являться налаштування профілю, мови та сповіщень. Якщо треба щось змінити вже зараз —
        напиши нам через «Дати фідбек» у меню акаунта.
      </p>
    </div>
  );
}
