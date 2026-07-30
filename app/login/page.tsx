import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

/**
 * Clean /login path on app.ruta.media (task 86d3e1egm). Mirrors the root login
 * screen so both `/` and `/login` resolve to login on the app subdomain.
 */
export default async function LoginPage() {
  const { user } = await getCurrentUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-6xl font-black tracking-tight text-zinc-900 sm:text-7xl">
            Ruta
          </h1>
          <p className="mt-2 text-base leading-normal text-zinc-600">твоя контент-подружка</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
