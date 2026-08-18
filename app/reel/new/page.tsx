import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import CreateReelScreen from '@/components/reels/CreateReelScreen';

/** Створення — reached from the ➕ in the reels list, which is why no list is here. */
export default async function NewReelPage() {
  const user = await requireAuth();
  if (!user) redirect('/');
  return <CreateReelScreen />;
}
