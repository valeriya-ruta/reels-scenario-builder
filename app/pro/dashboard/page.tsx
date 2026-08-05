import { redirect } from 'next/navigation';
import { getOperatorContext } from '@/lib/pro/operator';
import { getDashboardData } from '@/lib/pro/dashboard';
import ProDashboard from '@/components/pro/ProDashboard';

export const dynamic = 'force-dynamic';

/**
 * Ruta Pro aggregated dashboard — the "All / Dashboard" destination. A merged
 * content calendar across every blogger, colored + name-tagged per project, with
 * filter-by-blogger and per-blogger overview cards. Operator-only.
 */
export default async function ProDashboardPage() {
  const { user, isOperator } = await getOperatorContext();
  if (!user) redirect('/');
  // Non-operators see nothing Pro.
  if (!isOperator) redirect('/dashboard');

  const data = await getDashboardData();
  return <ProDashboard projects={data.projects} pieces={data.pieces} />;
}
