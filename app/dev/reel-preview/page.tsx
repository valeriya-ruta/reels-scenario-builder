import { notFound } from 'next/navigation';
import ReelTextScreen from '@/components/reels/ReelTextScreen';
import { emptyBlock } from '@/lib/reels/blocks';
import type { Project } from '@/lib/domain';

/**
 * The text screen, with no account and no database.
 *
 * The screen's real risks are in the browser and not in a type — does typing
 * work, does Enter cut the paragraph in the right place, does the selection bar
 * come up, does the underline land on the right words. Reaching it normally
 * needs a login and a real reel, which a test cannot have, so this mounts it on
 * fixed props instead. Saving fails here, on purpose: that is also the only
 * cheap way to see the «не збережено» state.
 *
 * Never reachable in production.
 */
export default function ReelPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const project: Project = {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'метод 12 тижнів',
    crew_mode: 'solo',
    project_type: 'reels',
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    user_id: '00000000-0000-4000-8000-000000000001',
    status: 'idea',
    caption: null,
    scheduled_date: null,
  };

  const first = {
    ...emptyBlock('talk', project.id, 0, '11111111-1111-4111-8111-111111111111'),
    spoken: 'Я мріяла про життя, де встигаю все — і не працюю до смерті.',
  };
  const second = {
    ...emptyBlock('talk', project.id, 1, '22222222-2222-4222-8222-222222222222'),
    spoken: 'Виявилось, річ не в дисципліні. Річ у дванадцяти тижнях замість цілого року.',
    overlays: [
      {
        id: 'o1',
        kind: 'text' as const,
        anchorText: 'дванадцяти тижнях',
        anchorStart: 'Виявилось, річ не в дисципліні. Річ у '.length,
        note: '«12 тижнів = 1 рік» великим шрифтом',
      },
    ],
  };

  return <ReelTextScreen project={project} initialBlocks={[first, second]} />;
}
