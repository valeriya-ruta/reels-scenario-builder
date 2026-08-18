'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';

/**
 * The mic a notes app has.
 *
 * Tap, talk, tap. What comes back is inserted where the caret was, so she can
 * dictate a sentence into the middle of what she has already written instead of
 * only ever appending. Nothing else happens: no separate capture screen, no
 * word gate, no «зробити з цього». It is a way of typing.
 */
/** So the empty-state «Наговорити» can start the same recorder the bar uses. */
export type MicHandle = { start: () => void };

const MicButton = forwardRef<MicHandle, {
  onText: (text: string) => void;
  onError: (message: string | null) => void;
}>(function MicButton({ onText, onError }, ref) {
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Held in a ref so `onstop` — which fires long after the render that set it —
  // calls the current handler rather than the one from mount.
  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTextRef.current = onText;
    onErrorRef.current = onError;
  }, [onText, onError]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const transcribe = useCallback(async (blob: Blob) => {
    setWorking(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'note.webm');
      const res = await fetch('/api/ideas/transcribe', { method: 'POST', body: fd });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Не вдалося розпізнати запис.');
      const piece = (data.text ?? '').trim();
      if (piece) onTextRef.current(piece);
    } catch (e) {
      onErrorRef.current(e instanceof Error ? e.message : 'Не вдалося розпізнати запис.');
    } finally {
      setWorking(false);
    }
  }, []);

  const start = useCallback(async () => {
    onErrorRef.current(null);
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
        stopStream();
        if (blob.size > 0) void transcribe(blob);
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch {
      onErrorRef.current('Немає доступу до мікрофона. Пиши текстом.');
    }
  }, [stopStream, transcribe]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    setRecording(false);
  }, []);

  useImperativeHandle(ref, () => ({ start: () => void start() }), [start]);

  return (
    <button
      type="button"
      data-testid="mic"
      data-recording={recording ? 'true' : 'false'}
      aria-label={recording ? 'Зупинити запис' : 'Наговорити'}
      disabled={working}
      // Keep the caret where it is: dictation lands at the caret, and focusing
      // the button would move it to the end of the note.
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
  );
});

export default MicButton;
