import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import DashboardHome from '@/components/DashboardHome';

export default async function DashboardPage() {
  const user = await requireAuth();
  if (!user) {
    redirect('/');
  }

  return <DashboardHome />;
}
