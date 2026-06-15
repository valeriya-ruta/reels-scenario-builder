import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getAllContent } from '@/lib/content/contentList';
import ContentLibrary from '@/components/content/ContentLibrary';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Full "Твій контент" library page (Status system 6/8). Reached via "Усі →" from
 * the Home recents. Lists every content piece (all types, all statuses),
 * most-recent-first, via the unified content read.
 */
export default async function ContentLibraryPage() {
  const user = await requireAuth();
  if (!user) redirect('/');

  const pieces = await getAllContent();
  return <ContentLibrary pieces={pieces} />;
}
