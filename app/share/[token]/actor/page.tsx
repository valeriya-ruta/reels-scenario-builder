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
      <div className="mx-auto max-w-2xl px-5 py-7 md:px-6">
        <div className="mb-7">
          <h1 className="text-2xl font-semibold leading-tight text-white md:text-3xl">
            {snapshotData.project.name}
          </h1>
        </div>
        <ActorView snapshotData={snapshotData} />
      </div>
    </div>
  );
}
