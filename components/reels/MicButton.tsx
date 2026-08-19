'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import {
  meterStream,
  startStreamingDictation,
  type DictationHandle,
} from '@/lib/ui/streamingDictation';

/**
 * The mic a notes app has.
 *
 * Tap, talk, tap. Words appear in the note WHILE she talks — the take is cut
 * into segments and each is transcribed while the next is spoken (see
 * streamingDictation) — and then the whole take, transcribed in one piece with
 * all of its own context, quietly replaces them a few seconds later.
 *
 * She never waits for the accurate version. The provisional text lands the
 * moment she stops and is hers to edit; the better one arrives behind it.
 *
 * The level meter beside it moves with her actual voice. It is the only signal
 * that proves the microphone is open, and it moves before a single word has
 * been recognised — a take once started without her noticing it had.
 */

export type MicHandle = { start: () => void };

const MicButton = forwardRef<
  MicHandle,
  {
    /** Everything heard so far this take. Provisional until `onDone`. */
    onInterim: (text: string) => void;
    /** The take is over. Provisional text; `refining` if a better one follows. */
    onDone: (text: string, refining: boolean) => void;
    /** The whole take in one piece, or null when that pass could not be made. */
    onRefined: (text: string | null) => void;
    onRecordingChange: (recording: boolean) => void;
    onError: (message: string | null) => void;
  }
>(function MicButton({ onInterim, onDone, onRefined, onRecordingChange, onError }, ref) {
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [refining, setRefining] = useState(false);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const dictationRef = useRef<DictationHandle | null>(null);
  const stopMeterRef = useRef<(() => void) | null>(null);

  // Held in a ref: these fire long after the render that set them.
  const cb = useRef({ onInterim, onDone, onRefined, onRecordingChange, onError });
  useEffect(() => {
    cb.current = { onInterim, onDone, onRefined, onRecordingChange, onError };
  }, [onInterim, onDone, onRefined, onRecordingChange, onError]);

  const releaseMic = useCallback(() => {
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => releaseMic(), [releaseMic]);

  const start = useCallback(async () => {
    cb.current.onError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stopMeterRef.current = meterStream(stream, setLevel);

      dictationRef.current = startStreamingDictation(stream, {
        onText: (text) => cb.current.onInterim(text),
        onPending: setPending,
        onError: (message) => cb.current.onError(message),
        onDone: (text, willRefine) => {
          releaseMic();
          setPending(false);
          setRefining(willRefine);
          cb.current.onDone(text, willRefine);
        },
        onRefined: (text) => {
          setRefining(false);
          cb.current.onRefined(text);
        },
      });

      setRecording(true);
      cb.current.onRecordingChange(true);
    } catch {
      releaseMic();
      cb.current.onError('Немає доступу до мікрофона. Пиши текстом.');
    }
  }, [releaseMic]);

  const stop = useCallback(() => {
    dictationRef.current?.stop();
    dictationRef.current = null;
    setRecording(false);
    cb.current.onRecordingChange(false);
  }, []);

  useImperativeHandle(ref, () => ({ start: () => void start() }), [start]);

  const busy = pending && !recording;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      <button
        type="button"
        data-testid="mic"
        data-recording={recording ? 'true' : 'false'}
        aria-label={recording ? 'Зупинити запис' : 'Наговорити'}
        disabled={busy}
        // Keep the caret where it is — dictation lands there, and focusing the
        // button would move it to the end of the note.
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={() => (recording ? stop() : void start())}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-white"
        style={{ backgroundColor: recording ? '#CE4E34' : '#14151F' }}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : recording ? (
          <Square className="h-4 w-4" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>

      {recording ? <Meter level={level} /> : null}

      {/* The accurate pass, running behind text she can already edit. Named
          rather than shown as a spinner, because a spinner over words that are
          already there reads as «something is broken». */}
      {refining && !recording ? (
        <span
          data-testid="mic-refining"
          className="whitespace-nowrap text-[11px] font-medium text-[color:var(--text-muted)]"
        >
          уточнюю…
        </span>
      ) : null}
    </div>
  );
});

/**
 * The proof that the mic is open.
 *
 * Driven by actual loudness rather than a canned animation: a looping graphic
 * would keep dancing with the microphone muted, which is the exact lie this is
 * here to prevent.
 */
function Meter({ level }: { level: number }) {
  const bars = [0.55, 0.85, 1, 0.7, 0.4];
  return (
    <span data-testid="mic-meter" className="flex h-11 items-center gap-[3px] pl-0.5" aria-hidden>
      {bars.map((weight, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-[#CE4E34] transition-[height] duration-75"
          style={{ height: `${Math.max(4, Math.min(26, level * weight * 30))}px` }}
        />
      ))}
    </span>
  );
}

export default MicButton;
