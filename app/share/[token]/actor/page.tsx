import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { SnapshotData } from '@/lib/domain';
import ActorView from '@/components/ActorView';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ActorSharePage({ params }: PageProps) {
  const { token } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: snapshot, error } = await supabase
    .from('snapshots')
    .select('*')
    .eq('actor_token', token)
    .single();

  if (error || !snapshot) {
    notFound();
  }

  const snapshotData = snapshot.snapshot_data as SnapshotData;

  return (
    <div className="min-h-screen bg-neutral-900">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-neutral-800 px-2 py-1 text-xs font-medium text-neutral-400">
              SHOOT MODE
            </span>
            <span className="text-xs text-neutral-500">Read-only snapshot</span>
          </div>
          <h1 className="text-2xl font-semibold text-white">
            {snapshotData.project.name}
          </h1>
        </div>
        <ActorView snapshotData={snapshotData} />
      </div>
    </div>
  );
}
