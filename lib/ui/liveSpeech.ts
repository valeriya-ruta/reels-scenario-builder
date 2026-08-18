'use client';

/**
 * Words on screen WHILE she is still talking.
 *
 * Whisper only answers once the recording stops, so for the whole length of a
 * take the screen showed nothing at all and there was no way to tell the app
 * was listening — or that it had heard anything. That is the difference between
 * dictation that feels alive and a button you distrust.
 *
 * The browser's own recogniser is what fills that gap: it streams interim
 * guesses within a few hundred milliseconds. It is deliberately NOT what gets
 * saved — it is rougher than Whisper, especially on Ukrainian — so its text is
 * shown as provisional and thrown away the moment the real transcript lands.
 * Two jobs: this one is feedback, Whisper is the record.
 *
 * Absent on some browsers (notably Firefox, and iOS below 14.5). There the take
 * still works exactly as before, just without the live preview, which is why
 * nothing here is allowed to throw.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: unknown) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function liveSpeechSupported(): boolean {
  return recognitionCtor() !== null;
}

/** Everything heard so far in this take, joined. */
function textFromEvent(event: unknown): string {
  const results = (event as { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }).results;
  if (!results) return '';
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const alt = results[i]?.[0]?.transcript;
    if (alt) parts.push(alt);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export type LiveSpeech = { stop: () => void };

/**
 * Start streaming interim text. Returns a handle, or null when unsupported.
 *
 * Restarts itself on `onend`: Android Chrome stops the recogniser after a few
 * seconds of silence, and without this the preview would die halfway through a
 * take while the actual recording kept going.
 */
export function startLiveSpeech(onText: (text: string) => void, lang = 'uk-UA'): LiveSpeech | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;

  let stopped = false;
  let recognition: SpeechRecognitionLike | null = null;
  // Kept across restarts so the preview does not reset to empty mid-take.
  let carried = '';

  const spin = () => {
    if (stopped) return;
    try {
      const r = new Ctor();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (event) => {
        const heard = textFromEvent(event);
        onText(carried ? `${carried} ${heard}`.trim() : heard);
      };
      r.onerror = () => {
        /* a denied mic or a network blip must not take the take down */
      };
      r.onend = () => {
        if (stopped) return;
        // Fold what this pass heard into the carry, then listen again.
        carried = carried.trim();
        spin();
      };
      recognition = r;
      r.start();
    } catch {
      /* unsupported in practice — the take still records */
    }
  };

  spin();

  return {
    stop: () => {
      stopped = true;
      try {
        recognition?.abort();
      } catch {
        /* already gone */
      }
      recognition = null;
    },
  };
}

/**
 * A 0..1 loudness reading from a live microphone stream, polled on animation
 * frames. Drives the level meter — the thing that says «я тебе чую» before any
 * word has been recognised at all.
 */
export function meterStream(stream: MediaStream, onLevel: (level: number) => void): () => void {
  let audio: AudioContext | null = null;
  let raf = 0;

  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return () => {};

    audio = new Ctx();
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      // RMS, scaled so ordinary speech uses most of the meter rather than the
      // bottom tenth of it.
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 3.2));
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    return () => {};
  }

  return () => {
    cancelAnimationFrame(raf);
    void audio?.close().catch(() => {});
  };
}
