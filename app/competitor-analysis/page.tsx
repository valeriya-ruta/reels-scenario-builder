import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import CompetitorAnalysisView from '@/components/CompetitorAnalysisView';

export default async function CompetitorAnalysisPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  return <CompetitorAnalysisView />;
}
