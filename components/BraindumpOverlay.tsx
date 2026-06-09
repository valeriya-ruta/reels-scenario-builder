'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Keyboard, Check, X } from 'lucide-react';
import { pickBraindumpPrompt } from '@/lib/braindumpPrompts';
import { CONTENT_TYPES, CONTENT_TYPE_ORDER, type ContentType } from '@/lib/contentTypes';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import BlurScrim from '@/components/BlurScrim';
import { generateReelFromRant } from '@/app/actions';
import { createStorytellingProjectFromRant } from '@/app/storytelling-actions';
import { createCarouselProjectFromRant } from '@/app/carousel-actions';
import type { CarouselRantOutput } from '@/lib/carouselTypes';

/**
 * Braindump overlay (task 86d38zghd) — voice-primary quick capture.
 *
 * NOT a route / not a hard modal-card: a full-screen blur overlay with elements
 * rising from the bottom. Two states on one continuous surface:
 *   State A (capture) — rotating prompt, mic affordance, gray transcript, word
 *     counter (n/50, soft target), keyboard/voice toggle, green check (done).
 *   State B (result) — text turns black & rises to the title position, auto-saved
 *     to ideas (faint "✓ Збережено в ідеї"), three independent content-type
 *     buttons that turn green when they create/queue that type.
 *
 * Voice reuses the existing Groq Whisper path via /api/ideas/transcribe
 * (whisper-large-v3-turbo, uk). Mic capture (MediaRecorder) is the only net-new
 * audio code. Auto-save posts to /api/ideas/braindump.
 */

const SOFT_WORD_TARGET = 50;
const ACCENT = '#004BA8';

type Phase = 'A' | 'B';
type InputMode = 'voice' | 'type';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type TypeStatus = 'idle' | 'loading' | 'done' | 'error';

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  return candidates.find((c) => MediaRecorder.isTypeSupported?.(c));
}

interface BraindumpOverlayProps {
  open: boolean;
  onClose: () => void;
}

export default function BraindumpOverlay({ open, onClose }: BraindumpOverlayProps) {
  const [phase, setPhase] = useState<Phase>('A');
  const [text, setText] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [typeStatus, setTypeStatus] = useState<Record<ContentType, TypeStatus>>({
    reels: 'idle',
    carousel: 'idle',
    stories: 'idle',
  });

  const prevPromptRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const textRef = useRef('');
  const typeTextarea = useRef<HTMLTextAreaElement>(null);
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Reset to a fresh capture each time the overlay opens; pick a new prompt.
  useEffect(() => {
    if (!open) return;
    const next = pickBraindumpPrompt(prevPromptRef.current);
    prevPromptRef.current = next;
    setPrompt(next);
    setPhase('A');
    setText('');
    setInputMode('voice');
    setError(null);
    setSaveStatus('idle');
    setSavedId(null);
    setTypeStatus({ reels: 'idle', carousel: 'idle', stories: 'idle' });
  }, [open]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Clean up media + timers on unmount / close.
  useEffect(() => {
    if (open) return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    stopStream();
    if (saveDebounce.current) clearTimeout(saveDebounce.current);
  }, [open, stopStream]);

  const appendTranscript = useCallback((chunk: string) => {
    const piece = chunk.trim();
    if (!piece) return;
    setText((prev) => (prev ? `${prev} ${piece}` : piece));
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setTranscribing(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append('audio', blob, 'braindump.webm');
        const res = await fetch('/api/ideas/transcribe', { method: 'POST', body: fd });
        const data = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Не вдалося розпізнати запис.');
        }
        appendTranscript(data.text ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося розпізнати запис.');
      } finally {
        setTranscribing(false);
      }
    },
    [appendTranscript]
  );

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
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError('Немає доступу до мікрофона. Дозволь доступ або введи текст.');
      setInputMode('type');
    }
  }, [stopStream, transcribe]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
  }, []);

  const toggleRecording = useCallback(() => {
    if (recording) stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  const toggleInputMode = useCallback(() => {
    setInputMode((m) => {
      if (m === 'voice') {
        if (recording) stopRecording();
        // Focus the textarea on the next tick once it's editable.
        setTimeout(() => typeTextarea.current?.focus(), 0);
        return 'type';
      }
      return 'voice';
    });
  }, [recording, stopRecording]);

  // --- Auto-save (no separate save button) ---
  const saveIdea = useCallback(
    async (content: string, id: string | null) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      setSaveStatus('saving');
      setError(null);
      try {
        const res = await fetch('/api/ideas/braindump', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(id ? { id, content: trimmed } : { content: trimmed }),
        });
        const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Не вдалося зберегти ідею.');
        }
        if (data.id) setSavedId(data.id);
        setSaveStatus('saved');
      } catch (e) {
        setSaveStatus('error');
        setError(e instanceof Error ? e.message : 'Не вдалося зберегти ідею.');
      }
    },
    []
  );

  // Done → transition to State B and auto-save.
  const handleDone = useCallback(() => {
    if (recording) stopRecording();
    if (!text.trim()) {
      setError('Спочатку запиши або введи ідею.');
      return;
    }
    setPhase('B');
    void saveIdea(text, null);
  }, [recording, stopRecording, text, saveIdea]);

  // Re-save edits made in State B (debounced), persisting the edited version.
  const handleEditInB = useCallback(
    (value: string) => {
      setText(value);
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      saveDebounce.current = setTimeout(() => {
        void saveIdea(value, savedId);
      }, 700);
    },
    [saveIdea, savedId]
  );

  const close = useCallback(() => {
    if (recording) stopRecording();
    stopStream();
    onClose();
  }, [recording, stopRecording, stopStream, onClose]);

  // --- Content-type creation (independent, non-exclusive, no navigation) ---
  const runType = useCallback(
    async (type: ContentType) => {
      if (typeStatus[type] === 'loading' || typeStatus[type] === 'done') return;
      const snapshot = textRef.current.trim();
      if (!snapshot) return;
      setTypeStatus((s) => ({ ...s, [type]: 'loading' }));
      try {
        let ok = false;
        if (type === 'reels') {
          const r = await generateReelFromRant(snapshot);
          ok = r.ok;
        } else if (type === 'stories') {
          const r = await createStorytellingProjectFromRant(snapshot);
          ok = r.ok;
        } else {
          const res = await fetch('/api/carousel/rant-to-slides', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ rant: snapshot }),
          });
          const data = (await res.json()) as CarouselRantOutput & { error?: string };
          if (res.ok && data.slides?.length) {
            const created = await createCarouselProjectFromRant(data, snapshot);
            ok = created.ok;
          }
        }
        setTypeStatus((s) => ({ ...s, [type]: ok ? 'done' : 'error' }));
      } catch {
        setTypeStatus((s) => ({ ...s, [type]: 'error' }));
      }
    },
    [typeStatus]
  );

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const words = countWords(text);

  return (
    <BlurScrim zIndex={70} blurPx={20} tint="rgba(255,255,255,0.55)">
      <div
        data-testid="braindump-overlay"
        data-phase={phase}
        role="dialog"
        aria-modal="true"
        aria-label="Швидка ідея"
        className="relative flex h-full w-full flex-col"
      >
        {/* Subtle radial lift under the text for legibility (no card/box border). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 55%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.3) 45%, transparent 78%)',
          }}
        />

        {/* Top bar: × close (+ saved confirmation in State B). Stays pinned at the
            top — only the content+controls below rise from the bottom. */}
        <div className="relative z-10 flex shrink-0 items-center justify-between px-5 pt-6">
          <div className="min-h-[20px]">
            {phase === 'B' && saveStatus === 'saved' && (
              <span data-testid="braindump-saved" className="text-xs font-medium text-zinc-400">
                ✓ Збережено в ідеї
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Закрити"
            data-testid="braindump-close"
            className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-800"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Spacer biases the content block toward just-below-centre and collapses
            the dead gap to the bottom controls. */}
        <div className="flex-1" aria-hidden />

        {/* Content + controls rise TOGETHER from the bottom (not just the buttons).
            Raised ~100px off the bottom so the two zones sit close together. */}
        <div
          className="relative z-10 px-6 pb-[110px]"
          style={{ animation: 'braindump-rise 320ms ease-out both' }}
        >
          {phase === 'A' ? (
            <h2
              data-testid="braindump-prompt"
              className="text-2xl font-bold leading-snug tracking-tight text-black"
            >
              {prompt}
            </h2>
          ) : (
            <textarea
              data-testid="braindump-edit"
              value={text}
              onChange={(e) => handleEditInB(e.target.value)}
              rows={4}
              aria-label="Текст ідеї"
              className="w-full resize-none bg-transparent text-xl font-semibold leading-snug tracking-tight text-black outline-none"
            />
          )}

          {phase === 'A' && (
            <div className="mt-3">
              {inputMode === 'type' ? (
                <textarea
                  ref={typeTextarea}
                  data-testid="braindump-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Накидай ідею..."
                  rows={4}
                  aria-label="Ідея"
                  className="w-full resize-none bg-transparent text-lg leading-relaxed text-zinc-500 outline-none placeholder:text-zinc-400"
                />
              ) : (
                <p
                  data-testid="braindump-text"
                  className="whitespace-pre-wrap text-lg leading-relaxed text-zinc-500"
                >
                  {text || (
                    <span className="text-zinc-400">
                      {transcribing ? 'Розпізнаю…' : 'Натисни мікрофон і говори…'}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {error && (
            <p data-testid="braindump-error" className="mt-3 text-sm font-medium text-zinc-500">
              {error}
            </p>
          )}

          {/* State A controls: mic (primary), counter, input toggle, done. */}
          {phase === 'A' && (
            <div className="mt-6">
              <div className="flex items-end justify-center pb-4">
                {inputMode === 'voice' && (
                  <button
                    type="button"
                    onClick={toggleRecording}
                    data-testid="braindump-mic"
                    aria-pressed={recording}
                    aria-label={recording ? 'Зупинити запис' : 'Почати запис'}
                    className="flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
                    style={{
                      backgroundColor: ACCENT,
                      boxShadow: recording
                        ? '0 0 0 8px rgba(0,75,168,0.18), 0 10px 30px rgba(0,75,168,0.45)'
                        : '0 10px 30px rgba(0,75,168,0.4)',
                      animation: recording ? 'reels-planner-scene-glow 1.4s ease-in-out infinite' : undefined,
                    }}
                  >
                    <Mic className="h-8 w-8" strokeWidth={2} />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span data-testid="braindump-counter" className="text-xs tabular-nums text-zinc-400">
                  {words}/{SOFT_WORD_TARGET}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleInputMode}
                    data-testid="braindump-toggle-input"
                    aria-label={inputMode === 'voice' ? 'Перейти до тексту' : 'Перейти до голосу'}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/70 text-zinc-600 transition-colors hover:bg-white hover:text-zinc-900"
                  >
                    {inputMode === 'voice' ? (
                      <Keyboard className="h-5 w-5" strokeWidth={1.9} />
                    ) : (
                      <Mic className="h-5 w-5" strokeWidth={1.9} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleDone}
                    data-testid="braindump-done"
                    aria-label="Готово"
                    disabled={transcribing}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--success)' }}
                  >
                    <Check className="h-5 w-5" strokeWidth={2.4} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* State B controls: three independent content-type buttons. */}
          {phase === 'B' && (
            <div className="mt-6">
              {saveStatus === 'error' && (
                <p className="mb-3 text-sm font-medium text-zinc-500">
                  Не вдалося зберегти — текст збережено локально, спробуй ще раз.
                </p>
              )}
              <p className="mb-3 text-sm font-medium text-zinc-500">Що зробимо з цієї ідеї?</p>
              <div className="grid grid-cols-3 gap-3">
                {CONTENT_TYPE_ORDER.map((type) => {
                  const meta = CONTENT_TYPES[type];
                  const status = typeStatus[type];
                  const done = status === 'done';
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => void runType(type)}
                      data-testid={`braindump-type-${type}`}
                      data-status={status}
                      disabled={status === 'loading'}
                      className="flex flex-col items-center gap-2 rounded-2xl border-2 px-2 py-4 text-sm font-semibold transition-colors"
                      style={{
                        borderColor: done ? 'var(--success)' : meta.color,
                        color: done ? 'var(--success)' : meta.color,
                        backgroundColor: done ? 'rgba(34,197,94,0.08)' : meta.soft,
                      }}
                    >
                      {done ? (
                        <Check className="h-6 w-6" strokeWidth={2.4} />
                      ) : status === 'loading' ? (
                        <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <ContentTypeIcon type={type} className="h-6 w-6" inheritColor />
                      )}
                      <span>{done ? 'Готово' : meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </BlurScrim>
  );
}
