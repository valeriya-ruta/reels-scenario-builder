'use client';

/**
 * Dictation that writes as she talks.
 *
 * The first version recorded the whole take, then sent it to Whisper on stop.
 * Two things were wrong with that, and they are the same thing: nothing
 * appeared for the entire take, and then stopping meant waiting again — long
 * enough that she left, recorded another one, and came back for it to still be
 * going.
 *
 * So the take is cut into segments and each one is transcribed while the next
 * is being spoken. Words land every few seconds, and by the time she stops
 * there is only the last short segment left to do.
 *
 * WHY RESTARTING THE RECORDER, rather than slicing the stream: a WebM blob is
 * only decodable with its header, which only the first chunk carries. Chunks
 * two onward are not a file. Stopping and immediately starting a new recorder
 * on the SAME live MediaStream gives a self-contained blob per segment, and the
 * gap between them is a few milliseconds of a track that is never closed.
 *
 * The browser's own recogniser is deliberately NOT used: it cannot open the
 * microphone while MediaRecorder holds it on Android, which is why the live
 * preview it was supposed to provide never appeared on her phone.
 */

/**
 * Long enough that a segment is a phrase, short enough that the wait is not
 * felt. Nine seconds still read as a delay; this plus Whisper's own second or
 * two puts words on screen about every five.
 */
const SEGMENT_MS = 4000;

export type DictationHandle = {
  /** Finish: closes the current segment and transcribes what is left. */
  stop: () => void;
};

export type DictationCallbacks = {
  /** Everything heard so far this take, in order. Called on every segment. */
  onText: (fullText: string) => void;
  /** True while a segment is still being transcribed. */
  onPending: (pending: boolean) => void;
  onError: (message: string) => void;
  /** The take is over and every segment has landed. */
  onDone: (fullText: string) => void;
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) =>
    MediaRecorder.isTypeSupported?.(t),
  );
}

export function startStreamingDictation(
  stream: MediaStream,
  cb: DictationCallbacks,
): DictationHandle {
  const mime = pickMime();
  // Segments are numbered so a slow one cannot land after a fast one and
  // scramble her sentences — Whisper is not uniformly quick.
  const heard = new Map<number, string>();
  let nextIndex = 0;
  let settled = 0;
  let stopping = false;
  let recorder: MediaRecorder | null = null;
  let rotate: ReturnType<typeof setTimeout> | null = null;

  const assembled = () =>
    [...heard.entries()]
      .sort((a, z) => a[0] - z[0])
      .map(([, t]) => t.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  const finish = () => {
    if (!stopping || settled < nextIndex) return;
    cb.onPending(false);
    cb.onDone(assembled());
  };

  const send = async (blob: Blob, index: number) => {
    try {
      const fd = new FormData();
      fd.append('audio', blob, `take-${index}.webm`);
      const res = await fetch('/api/ideas/transcribe', { method: 'POST', body: fd });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Не вдалося розпізнати запис.');
      heard.set(index, data.text ?? '');
      cb.onText(assembled());
    } catch (e) {
      // One lost segment must not lose the take: the others still land, and a
      // gap she can see is better than an error over words she just said.
      heard.set(index, '');
      cb.onError(e instanceof Error ? e.message : 'Частину запису не вдалося розпізнати.');
    } finally {
      settled += 1;
      finish();
    }
  };

  const spin = () => {
    if (stopping) return;
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      cb.onError('Не вдалося записати звук.');
      return;
    }

    const index = nextIndex++;
    const parts: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) parts.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(parts, { type: mime || 'audio/webm' });
      // A segment of pure silence still costs a round trip; skip the empties.
      if (blob.size > 1024) {
        cb.onPending(true);
        void send(blob, index);
      } else {
        heard.set(index, '');
        settled += 1;
        finish();
      }
      // Start the next segment straight away — the microphone was never closed.
      spin();
    };

    recorder = rec;
    rec.start();
    rotate = setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, SEGMENT_MS);
  };

  spin();

  return {
    stop: () => {
      if (stopping) return;
      stopping = true;
      if (rotate) clearTimeout(rotate);
      const rec = recorder;
      if (rec && rec.state !== 'inactive') rec.stop();
      else finish();
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
    // Chrome hands back a SUSPENDED context and only runs it after an explicit
    // resume, so the analyser read silence forever and the bars sat still even
    // though the microphone was open.
    void audio.resume().catch(() => {});
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
