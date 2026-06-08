import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { transcribeAudioFile } from '@/lib/ai/sttProvider';

export const runtime = 'nodejs';

/**
 * Braindump voice transcription. Accepts a multipart `audio` blob captured in the
 * browser (MediaRecorder) and runs it through the EXISTING Groq Whisper path
 * (whisper-large-v3-turbo, language uk) — same client/key/direct-bytes upload as
 * reel transcription. Returns the recognised text.
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
    const result = await transcribeAudioFile(audio, { language: 'uk' });
    return NextResponse.json({ ok: true, text: result.transcript });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Не вдалося розпізнати запис.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
