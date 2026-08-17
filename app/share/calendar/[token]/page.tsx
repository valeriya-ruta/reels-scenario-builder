import { notFound } from 'next/navigation';
import { getSharedCalendar } from '@/lib/calendar/share';
import SharedCalendarView from '@/components/share/SharedCalendarView';

export const dynamic = 'force-dynamic';

/**
 * Public, no-login client calendar. The client sees the month, taps a day to see
 * what is planned on it, and taps a piece to read it in full. Read-only
 * throughout — there is no status ring, no date chip, nothing that writes. An
 * unknown or revoked token 404s (regenerating invalidates the old link).
 */
export default async function SharedCalendarPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const calendar = await getSharedCalendar(token);
  if (!calendar) notFound();

  return (
    <SharedCalendarView
      token={calendar.token}
      title={calendar.title}
      note={calendar.note}
      pieces={calendar.pieces}
    />
  );
}
