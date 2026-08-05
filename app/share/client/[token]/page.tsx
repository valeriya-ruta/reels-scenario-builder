import { notFound } from 'next/navigation';
import { getShareByToken } from '@/lib/pro/share';
import ClientSwipeDeck from '@/components/pro/ClientSwipeDeck';

export const dynamic = 'force-dynamic';

/**
 * Public, no-login client review link. The client can ONLY approve/reject the
 * prepped ideas (Tinder-style swipe) — no adding ideas, no notes. A revoked or
 * unknown token 404s (regenerating invalidates the old link).
 */
export default async function ClientSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await getShareByToken(token);
  if (!link) notFound();

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <ClientSwipeDeck
        token={link.token}
        ideas={link.ideas}
        initialDecisions={link.decisions}
        projectName={link.projectName}
        projectColor={link.projectColor}
        projectEmoji={link.projectEmoji}
      />
    </div>
  );
}
