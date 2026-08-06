import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { transcribeAudioFile } from '@/lib/ai/sttProvider';
import { liveCountLimit } from '@/lib/ratelimit';
import { countWords } from '@/lib/braindump/wordGate';

export const runtime = 'nodejs';

/**
 * Live word count while the user is still speaking (§4, task 86d3wadg3).
 *
 * Returns ONLY a number. That is the whole point: the braindump's saved
 * transcript stays the single source of truth produced by the one Whisper
 * pass on stop, and nothing here can ever overwrite it. Interim passes are
 * lossy by nature — a truncated container, a half-finished sentence — so they
 * are allowed to inform a counter and nothing else.
 *
 * On the vendor: the spec named Deepgram's streaming layer, but no Deepgram key
 * is configured in this project and adding a vendor is not a refinement. This
 * reuses the Whisper path (`whisper-large-v3-turbo` via OpenRouter) that already
 * carries the braindump, polled every few seconds by the client. The
 * user-visible outcome is the same — a count that ticks up while she talks,
 * killing the speak→stop→check→speak loop — at a coarser tick. If a true
 * word-by-word tick is wanted later, this route is the seam to swap.
 */
export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: 'Потрібен вхід.' }, { status: 401 });
  }

  const { success } = await liveCountLimit.limit(user.id);
  if (!success) {
    // Silently stop ticking rather than erroring — the counter is an
    // affordance, not a feature the capture depends on.
    return NextResponse.json({ ok: true, words: null });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Некоректний формат запиту.' }, { status: 400 });
  }

  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ ok: true, words: null });
  }

  try {
    const result = await transcribeAudioFile(audio, { language: 'uk' });
    return NextResponse.json({ ok: true, words: countWords(result.transcript) });
  } catch {
    // An interim pass over a truncated container fails sometimes; that is
    // expected and must never surface as an error to someone mid-sentence.
    return NextResponse.json({ ok: true, words: null });
  }
}
