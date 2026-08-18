'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Keyboard, Link2, Mic, Square, X } from 'lucide-react';
import {
  createBlankReel,
  createReelFromReference,
  createReelFromSpeech,
} from '@/app/reel-create-actions';

/**
 * Створення — and only creation.
 *
 * Opens from the ➕ in the reels list, so the list is not repeated here. Three
 * doors, voice first because it is the fastest way to get a thought out of a
 * head and the case this app is mostly for.
 *
 * Nothing is asked. No name, no status, no date, no structure — those belong on
 * the reel once it exists, where she sees them every time she opens it. The
 * whole screen is one decision wide.
 */

type Door = null | 'speak' | 'link';

const CHUNK_MS = 1000;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) =>
    MediaRecorder.isTypeSupported?.(t),
  );
}

export default function CreateReelScreen() {
  const router = useRouter();
  const [door, setDoor] = useState<Door>(null);
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const transcribe = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'reel.webm');
      const res = await fetch('/api/ideas/transcribe', { method: 'POST', body: fd });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Не вдалося розпізнати запис.');
      const piece = (data.text ?? '').trim();
      if (piece) setText((prev) => (prev ? `${prev} ${piece}` : piece));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося розпізнати запис.');
    } finally {
      setTranscribing(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
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
      recorder.start(CHUNK_MS);
      setRecording(true);
    } catch {
      setError('Немає доступу до мікрофона. Напиши текстом.');
    }
  }, [stopStream, transcribe]);

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
    setRecording(false);
  }, []);

  const go = async (run: () => Promise<{ ok: true; projectId: string } | { ok: false; error: string }>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await run();
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    // Deliberately not resetting `busy`: the screen is leaving, and a button
    // that goes live again for the half-second before it does creates a second
    // reel nobody asked for.
    router.replace(`/project/${res.projectId}`);
  };

  const close = () => {
    if (recording) stopRecording();
    stopStream();
    router.back();
  };

  return (
    <div className="app-canvas min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[680px] flex-col px-4 pb-6 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <p className="app-title text-[19px]">Новий рілс</p>
          <button
            type="button"
            aria-label="Закрити"
            onClick={close}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[color:var(--text-muted)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {door === null ? (
          // The three doors sit low: a thumb does not reach the top of a phone,
          // and this is the most-tapped screen in the app.
          <div className="mt-auto flex flex-col gap-3 pb-2">
            <Door
              primary
              icon={<Mic className="h-5 w-5" />}
              title="Наговорити"
              hint="Тримай і розкажи, як другові. Далі я скорочу і зроблю з початку гачок."
              onClick={() => setDoor('speak')}
            />
            <Door
              icon={<Keyboard className="h-5 w-5" />}
              title="Написати"
              hint="Порожній аркуш."
              onClick={() => void go(createBlankReel)}
            />
            <Door
              icon={<Link2 className="h-5 w-5" />}
              title="З референсу"
              hint="Встав посилання на Reels — розберу на текст."
              onClick={() => setDoor('link')}
            />
          </div>
        ) : null}

        {door === 'speak' ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <textarea
                ref={areaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  recording
                    ? 'Слухаю…'
                    : transcribing
                      ? 'Розшифровую…'
                      : 'Натисни мікрофон і розкажи. Або пиши сюди.'
                }
                className="min-h-[40vh] w-full resize-none bg-transparent text-[18px] leading-[1.6] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none"
              />
            </div>

            {error ? (
              <p role="alert" className="pb-2 text-[13px] text-red-600">
                {error}
              </p>
            ) : null}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                data-testid="mic"
                aria-label={recording ? 'Зупинити запис' : 'Записати'}
                onClick={() => (recording ? stopRecording() : void startRecording())}
                className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: recording ? '#CE4E34' : '#004BA8' }}
              >
                {recording ? <Square className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
              </button>
              <button
                type="button"
                data-testid="make-reel"
                disabled={busy || transcribing || !text.trim()}
                onClick={() => void go(() => createReelFromSpeech(text))}
                className="min-h-[52px] flex-1 rounded-[14px] bg-[color:var(--accent)] text-[16px] font-semibold text-white disabled:opacity-40"
              >
                {busy ? 'Роблю рілс…' : 'Зробити рілс'}
              </button>
            </div>
          </div>
        ) : null}

        {door === 'link' ? (
          <div className="mt-auto flex flex-col gap-3 pb-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              inputMode="url"
              autoFocus
              placeholder="https://instagram.com/reel/…"
              className="min-h-[52px] w-full rounded-[14px] border border-[color:var(--border)] bg-[color:var(--background)] px-4 text-[16px] text-[color:var(--foreground)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--accent)]"
            />
            {error ? (
              <p role="alert" className="text-[13px] text-red-600">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy || !link.trim()}
              onClick={() => void go(() => createReelFromReference(link))}
              className="min-h-[52px] w-full rounded-[14px] bg-[color:var(--accent)] text-[16px] font-semibold text-white disabled:opacity-40"
            >
              {busy ? 'Розбираю…' : 'Розібрати'}
            </button>
            <p className="text-center text-[12px] text-[color:var(--text-muted)]">
              Це займе до хвилини — треба скачати відео і розшифрувати звук.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Door({
  icon,
  title,
  hint,
  primary = false,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="door"
      data-door={title}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-[16px] border p-4 text-left"
      style={{
        borderColor: primary ? 'var(--accent)' : 'var(--border)',
        backgroundColor: primary ? 'var(--accent-soft)' : 'var(--surface)',
      }}
    >
      <span
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]"
        style={{
          backgroundColor: primary ? 'var(--accent)' : 'var(--surface1)',
          color: primary ? '#fff' : 'var(--text-secondary)',
        }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] font-semibold text-[color:var(--foreground)]">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-[color:var(--text-muted)]">
          {hint}
        </span>
      </span>
    </button>
  );
}
