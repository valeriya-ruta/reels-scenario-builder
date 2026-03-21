import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export default async function Home() {
  const { user } = await getCurrentUser();

  if (user) {
    redirect('/projects');
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-6xl font-black tracking-tight text-zinc-900 sm:text-7xl">
          Ruta
        </h1>
        <p className="mt-2 text-zinc-600">твоя контент-подружка</p>
      </div>
      <LoginForm />
    </div>
  );
}
