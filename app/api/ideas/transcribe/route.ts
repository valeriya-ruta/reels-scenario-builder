import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { transcribeAudioFile } from '@/lib/ai/sttProvider';

export const runtime = 'nodejs';

/**
 * Voice transcription for anything recorded in the browser — dictation into a
 * reel, and the braindump.
 *
 * `mode` says which half of a dictated take this is. A take is recorded twice
 * over: in four-second PREVIEW segments so words appear while she is still
 * talking, and once whole as the FINAL, which is the one that gets kept. They
 * are transcribed the same way; the difference is only that a preview segment
 * is four seconds of context and a final is the entire take, which is what the
 * accuracy was missing.
 */
export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: 'Потрібен вхід.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Некоректний формат запиту.' }, { status: 400 });
  }

  const audio = form.get('audio');
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: 'Аудіо не отримано.' }, { status: 400 });
  }

  try {
    const result = await transcribeAudioFile(audio, {
      language: 'uk',
      filename: form.get('mode') === 'final' ? 'take.webm' : 'segment.webm',
      quality: 'accurate',
    });
    return NextResponse.json({ ok: true, text: result.transcript });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не вдалося розпізнати запис.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
