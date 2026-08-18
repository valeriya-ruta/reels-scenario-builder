'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { meterStream, startLiveSpeech, type LiveSpeech } from '@/lib/ui/liveSpeech';

/**
 * The mic a notes app has.
 *
 * Tap, talk, tap. What comes back is inserted where the caret was, so she can
 * dictate into the middle of what she has already written rather than only ever
 * appending.
 *
 * Two things it must SHOW, both learned the hard way:
 *
 *   1. That it is recording. A red square is not enough — it started once
 *      without her noticing it had. So a live level meter moves with her voice:
 *      it is the only signal that proves the mic is actually open, and it moves
 *      before a single word has been recognised.
 *   2. What it is hearing, WHILE she talks. Whisper answers only on stop, so
 *      for the length of a whole take the screen used to show nothing. The
 *      browser's recogniser fills that in as provisional text; Whisper still
 *      produces the version that gets saved.
 */

export type MicHandle = { start: () => void };

const MicButton = forwardRef<
  MicHandle,
  {
    /** The real transcript, once the take ends. Replaces any preview. */
    onText: (text: string) => void;
    /** Provisional words, while she is still speaking. */
    onInterim: (text: string) => void;
    /** Take started / ended, so the note can hold a place for the preview. */
    onRecordingChange: (recording: boolean) => void;
    onError: (message: string | null) => void;
  }
>(function MicButton({ onText, onInterim, onRecordingChange, onError }, ref) {
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [level, setLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const liveRef = useRef<LiveSpeech | null>(null);
  const stopMeterRef = useRef<(() => void) | null>(null);

  // Held in refs: `onstop` fires long after the render that set them.
  const cb = useRef({ onText, onInterim, onRecordingChange, onError });
  useEffect(() => {
    cb.current = { onText, onInterim, onRecordingChange, onError };
  }, [onText, onInterim, onRecordingChange, onError]);

  const teardown = useCallback(() => {
    liveRef.current?.stop();
    liveRef.current = null;
    stopMeterRef.current?.();
    stopMeterRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const transcribe = useCallback(async (blob: Blob) => {
    setWorking(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'note.webm');
      const res = await fetch('/api/ideas/transcribe', { method: 'POST', body: fd });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Не вдалося розпізнати запис.');
      cb.current.onText((data.text ?? '').trim());
    } catch (e) {
      // The preview is dropped too — showing words that were never saved is
      // worse than showing none, because they look like they are in the note.
      cb.current.onText('');
      cb.current.onError(e instanceof Error ? e.message : 'Не вдалося розпізнати запис.');
    } finally {
      setWorking(false);
    }
  }, []);

  const start = useCallback(async () => {
    cb.current.onError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) =>
        MediaRecorder.isTypeSupported?.(t),
      );
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        teardown();
        if (blob.size > 0) void transcribe(blob);
        else cb.current.onText('');
      };
      recorderRef.current = recorder;
      recorder.start(1000);

      stopMeterRef.current = meterStream(stream, setLevel);
      liveRef.current = startLiveSpeech((text) => cb.current.onInterim(text));

      setRecording(true);
      cb.current.onRecordingChange(true);
    } catch {
      teardown();
      cb.current.onError('Немає доступу до мікрофона. Пиши текстом.');
    }
  }, [teardown, transcribe]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    setRecording(false);
    cb.current.onRecordingChange(false);
  }, []);

  useImperativeHandle(ref, () => ({ start: () => void start() }), [start]);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      <button
        type="button"
        data-testid="mic"
        data-recording={recording ? 'true' : 'false'}
        aria-label={recording ? 'Зупинити запис' : 'Наговорити'}
        disabled={working}
        // Keep the caret where it is — dictation lands there, and focusing the
        // button would move it to the end of the note.
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={() => (recording ? stop() : void start())}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-white"
        style={{ backgroundColor: recording ? '#CE4E34' : '#14151F' }}
      >
        {working ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : recording ? (
          <Square className="h-4 w-4" />
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>

      {recording ? <Meter level={level} /> : null}
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
