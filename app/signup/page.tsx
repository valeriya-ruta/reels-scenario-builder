import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { GATE_COOKIE, isGrantValid } from '@/lib/accessCode';
import SignupForm from '@/components/SignupForm';
import AccessCodeGate from '@/components/AccessCodeGate';

export default async function SignupPage() {
  const { user } = await getCurrentUser();

  if (user) {
    redirect('/dashboard');
  }

  // Access-code gate: signup is reachable only after a valid code has been
  // validated server-side (sets an HttpOnly signed grant cookie). Until then we
  // render the gate screen instead of the signup form.
  const jar = await cookies();
  const granted = isGrantValid(jar.get(GATE_COOKIE)?.value);

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#f5f2ed' }}
    >
      {granted ? <SignupForm /> : <AccessCodeGate />}
    </div>
  );
}
