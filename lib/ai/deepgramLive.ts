'use client';

/**
 * Deepgram LIVE streaming word counter for the braindump overlay (task 86d3dcwyy).
 *
 * This drives ONLY the live word count + 50-word gate while recording. It never
 * becomes the saved transcript — Groq Whisper (large-v3-turbo) stays the source
 * of truth, resolved on stop. The live count may differ from the final Whisper
 * count by a few words; that is by design and must not error.
 *
 * Auth: a 60-second access token is minted server-side (/api/ideas/deepgram-token)
 * so the long-lived key never reaches the browser. We connect with the `bearer`
 * WebSocket subprotocol. If the token endpoint is unconfigured (no key) or any
 * step fails, `start` resolves to a no-op session and the caller silently
 * degrades to the Whisper-only count.
 *
 * Mobile-first / iOS Safari: WebSocket + the existing MediaRecorder webm/opus
 * (or mp4 on Safari) chunks are streamed straight through; nothing here relies
 * on the Web Speech API (broken on iOS Safari).
 */

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

export interface DeepgramLiveSession {
  /** Feed a recorder chunk (from MediaRecorder.ondataavailable) to the stream. */
  send: (chunk: BlobPart) => void;
  /** Close the stream and release the socket. Safe to call multiple times. */
  stop: () => void;
  /** True only when a live socket is actually open and counting. */
  readonly active: boolean;
}

const NOOP_SESSION: DeepgramLiveSession = {
  send: () => {},
  stop: () => {},
  get active() {
    return false;
  },
};

/**
 * Opens a Deepgram live session. `onWordCount` is called with the running word
 * count (finalized + interim) as speech is recognized. Always resolves — on any
 * failure it returns a no-op session so recording is never blocked.
 */
export async function startDeepgramLive(
  onWordCount: (words: number) => void,
): Promise<DeepgramLiveSession> {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return NOOP_SESSION;

  let token: string | null = null;
  try {
    const res = await fetch('/api/ideas/deepgram-token', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as { access_token?: string };
      token = data.access_token ?? null;
    }
  } catch {
    // network/unconfigured — degrade silently.
  }
  if (!token) return NOOP_SESSION;

  let ws: WebSocket;
  try {
    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'uk',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
    });
    ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['bearer', token]);
  } catch {
    return NOOP_SESSION;
  }

  let finals = '';
  let interim = '';
  let open = false;
  let closed = false;
  const queue: BlobPart[] = [];

  const flush = () => {
    if (!open || ws.readyState !== WebSocket.OPEN) return;
    while (queue.length) {
      const chunk = queue.shift()!;
      try {
        ws.send(chunk as ArrayBuffer | Blob);
      } catch {
        /* ignore individual send failures */
      }
    }
  };

  ws.onopen = () => {
    open = true;
    flush();
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as {
        channel?: { alternatives?: { transcript?: string }[] };
        is_final?: boolean;
      };
      const transcript = msg.channel?.alternatives?.[0]?.transcript ?? '';
      if (msg.is_final) {
        if (transcript) finals = finals ? `${finals} ${transcript}` : transcript;
        interim = '';
      } else {
        interim = transcript;
      }
      onWordCount(countWords(interim ? `${finals} ${interim}` : finals));
    } catch {
      /* ignore malformed frames */
    }
  };

  ws.onerror = () => {
    /* swallow — caller stays on Whisper-only counting */
  };

  return {
    send(chunk: BlobPart) {
      if (closed) return;
      queue.push(chunk);
      flush();
    },
    stop() {
      if (closed) return;
      closed = true;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
      } catch {
        /* ignore */
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
    get active() {
      return open && !closed;
    },
  };
}
