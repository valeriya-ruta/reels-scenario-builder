'use client';

/**
 * Dictation that writes as she talks — and then gets it right.
 *
 * TWO RECORDINGS OF THE SAME TAKE, on the same open microphone.
 *
 * 1. The SEGMENT recorder is stopped and restarted every few seconds, so each
 *    piece can be transcribed while the next is being spoken and words appear
 *    on screen while she is still talking.
 * 2. The WHOLE recorder runs from the first word to the last and is transcribed
 *    once, in one piece, when she stops.
 *
 * The segments are a preview. The whole take is the TRUTH, and it replaces them.
 *
 * Why both, rather than segments alone: Whisper and every model like it decides
 * a word from the words around it. A four-second slice has almost no around —
 * it starts mid-phrase, ends mid-word, and carries none of the sentence that
 * would have settled the ambiguity. Segmenting is what made the preview fast
 * and it is also what made the transcript wrong, and those cannot both be fixed
 * in one request. So they are two requests: the fast one and the correct one.
 *
 * WHY RESTARTING THE SEGMENT RECORDER, rather than slicing its stream: a WebM
 * blob is only decodable with its header, which only the first chunk carries.
 * Chunks two onward are not a file. Stopping and immediately starting a new
 * recorder on the SAME live MediaStream gives a self-contained blob per
 * segment, and the gap between them is a few milliseconds of a track that is
 * never closed.
 *
 * The browser's own recogniser is deliberately NOT used: it cannot open the
 * microphone while MediaRecorder holds it on Android, which is why the live
 * preview it was supposed to provide never appeared on her phone.
 */

/**
 * Long enough that a segment is a phrase, short enough that the wait is not
 * felt. This only sets how fast the PREVIEW moves — accuracy no longer depends
 * on it, because the whole take is transcribed again at the end.
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
  /**
   * The take is over and every segment has landed. This text is PROVISIONAL —
   * it goes into the note immediately so nothing is ever lost or waited for.
   * `refining` says whether a better version of it is still on its way.
   */
  onDone: (fullText: string, refining: boolean) => void;
  /**
   * The whole take, transcribed in one piece. This is what should be kept.
   * `null` when the accurate pass could not be made at all — the provisional
   * text already on screen is then the best there is, and stays.
   */
  onRefined: (fullText: string | null) => void;
};

function pickMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) =>
    MediaRecorder.isTypeSupported?.(t),
  );
}

async function transcribe(blob: Blob, name: string, mode: 'preview' | 'final'): Promise<string> {
  const fd = new FormData();
  fd.append('audio', blob, name);
  fd.append('mode', mode);
  const res = await fetch('/api/ideas/transcribe', { method: 'POST', body: fd });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || data.error) throw new Error(data.error || 'Не вдалося розпізнати запис.');
  return data.text ?? '';
}

export function startStreamingDictation(
  stream: MediaStream,
  cb: DictationCallbacks,
): DictationHandle {
  const mime = pickMime();
  // Segments are numbered so a slow one cannot land after a fast one and
  // scramble her sentences — transcription is not uniformly quick.
  const heard = new Map<number, string>();
  let nextIndex = 0;
  let settled = 0;
  let stopping = false;
  let recorder: MediaRecorder | null = null;
  let rotate: ReturnType<typeof setTimeout> | null = null;
  let announced = false;

  const assembled = () =>
    [...heard.entries()]
      .sort((a, z) => a[0] - z[0])
      .map(([, t]) => t.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  // ── the whole take, recorded alongside the segments ──────────────────────
  //
  // A second MediaRecorder on the same live stream. If the browser refuses one
  // (older Android WebViews will), dictation carries on exactly as before and
  // the segments are simply the final answer.
  const wholeParts: BlobPart[] = [];
  let whole: MediaRecorder | null = null;
  /** Held until `onDone` has gone out — see `deliverRefined`. */
  let refined: { text: string | null } | null = null;

  const canRefine = () => whole !== null;

  /**
   * The accurate take, but never before the provisional one.
   *
   * The whole-take recorder stops FIRST, so on a short or silent take its
   * verdict can be ready before the last segment has finished transcribing.
   * Delivered in that order it would arrive with nothing to replace yet, and
   * the screen would then be told the take is refining when it is already done
   * — leaving the provisional words in place for good.
   */
  const deliverRefined = (text: string | null) => {
    if (!announced) {
      refined = { text };
      return;
    }
    cb.onRefined(text);
  };

  const finish = () => {
    if (!stopping || settled < nextIndex || announced) return;
    announced = true;
    cb.onPending(false);
    cb.onDone(assembled(), canRefine());
    if (refined) {
      const held = refined;
      refined = null;
      cb.onRefined(held.text);
    }
  };

  try {
    whole = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    whole.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) wholeParts.push(e.data);
    };
    whole.onstop = () => {
      const blob = new Blob(wholeParts, { type: mime || 'audio/webm' });
      if (blob.size <= 1024) {
        deliverRefined(null);
        return;
      }
      transcribe(blob, 'take.webm', 'final')
        .then((text) => deliverRefined(text.trim() || null))
        // Silent: the provisional text is already in the note and correct
        // enough to work with. An error here would be an alarm about something
        // she cannot see and does not need to act on.
        .catch(() => deliverRefined(null));
    };
    whole.start();
  } catch {
    whole = null;
  }

  const send = async (blob: Blob, index: number) => {
    try {
      heard.set(index, await transcribe(blob, `take-${index}.webm`, 'preview'));
      cb.onText(assembled());
    } catch (e) {
      // One lost segment must not lose the take: the others still land, the
      // whole-take pass does not have the gap at all, and a hole she can see is
      // better than an error over words she just said.
      heard.set(index, '');
      if (!canRefine()) {
        cb.onError(e instanceof Error ? e.message : 'Частину запису не вдалося розпізнати.');
      }
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
      if (whole && whole.state !== 'inactive') whole.stop();
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
