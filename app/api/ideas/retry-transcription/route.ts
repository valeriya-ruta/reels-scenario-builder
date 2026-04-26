import { NextResponse } from 'next/server';
import { retryIdeaReelTranscription } from '@/app/competitor-analysis-actions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { scan_id?: string; reel_id?: string };
  try {
    body = (await req.json()) as { scan_id?: string; reel_id?: string };
  } catch {
    return NextResponse.json({ error: 'Некоректний формат запиту.' }, { status: 400 });
  }

  const scanId = body.scan_id?.trim() ?? '';
  const reelId = body.reel_id?.trim() ?? '';
  if (!scanId || !reelId) {
    return NextResponse.json({ error: 'Потрібні scan_id та reel_id.' }, { status: 400 });
  }

  const result = await retryIdeaReelTranscription(scanId, reelId);
  if (!result.ok) {
    const status = result.error === 'Потрібен вхід.' ? 401 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    transcript: result.transcript,
    template_pattern: result.template_pattern,
    template_lines: result.template_lines,
    transcript_source: result.transcript_source,
    transcript_status: result.transcript_status,
    transcript_attempts: result.transcript_attempts,
    use_caption_fallback: result.mode === 'caption_fallback',
  });
}
