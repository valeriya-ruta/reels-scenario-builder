import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Mints a short-lived Deepgram access token for the braindump LIVE word counter
 * (task 86d3dcwyy). The browser streams mic audio to Deepgram's streaming STT
 * over a WebSocket purely to drive the live word count + 50-word gate — Groq
 * Whisper stays the source of truth for the saved transcript.
 *
 * The long-lived `DEEPGRAM_API_KEY` NEVER reaches the client: we exchange it
 * server-side for a 60-second grant (`/v1/auth/grant`) and hand only that token
 * to the browser, which connects with the `bearer` WebSocket subprotocol.
 *
 * ⚠️ Requires the `DEEPGRAM_API_KEY` env var (Vercel project settings). It is
 * intentionally NOT committed. When the key is absent this returns 503 and the
 * client degrades gracefully: no live ticking, the counter still recalibrates to
 * the Whisper count on stop (never errors). Flagged to Kunj before deploy.
 */
export async function POST() {
  const user = await requireAuth();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) {
    // Not an error state for the client — live transcription is simply off until
    // the key is provisioned. The gate falls back to the Whisper word count.
    return NextResponse.json({ error: 'deepgram_unconfigured' }, { status: 503 });
  }

  try {
    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: { authorization: `Token ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: 60 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.error('[deepgram-token] grant failed:', res.status, await res.text());
      return NextResponse.json({ error: 'deepgram_grant_failed' }, { status: 502 });
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      return NextResponse.json({ error: 'deepgram_grant_failed' }, { status: 502 });
    }
    return NextResponse.json({ access_token: data.access_token, expires_in: data.expires_in ?? 60 });
  } catch (e) {
    console.error('[deepgram-token] grant error:', e);
    return NextResponse.json({ error: 'deepgram_grant_failed' }, { status: 502 });
  }
}
