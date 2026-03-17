import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export default async function Home() {
  const { user } = await getCurrentUser();

  if (user) {
    redirect('/projects');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-zinc-900">Планувальник Рілів</h1>
          <p className="mt-2 text-zinc-600">
            План зйомок та сцен для коротких відео
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
