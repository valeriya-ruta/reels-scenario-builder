import { redirect } from 'next/navigation';
import { getOperatorContext } from '@/lib/pro/operator';
import { getBugReports } from '@/lib/pro/reports';
import ProReports from '@/components/pro/ProReports';

export const dynamic = 'force-dynamic';

/** Operator's bug-report inbox (the Звіти "statistics" view). */
export default async function ProReportsPage() {
  const { user, isOperator } = await getOperatorContext();
  if (!user) redirect('/');
  if (!isOperator) redirect('/dashboard');

  const reports = await getBugReports();
  return <ProReports reports={reports} />;
}
