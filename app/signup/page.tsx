import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import SignupForm from '@/components/SignupForm';

export default async function SignupPage() {
  const { user } = await getCurrentUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#f5f2ed' }}
    >
      <SignupForm />
    </div>
  );
}
