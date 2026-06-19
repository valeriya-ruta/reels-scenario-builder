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
import { startDeepgramLive, type DeepgramLiveSession } from '@/lib/ai/deepgramLive';

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

/**
 * Minimum words a braindump must contain before it can be turned into content
 * (task 86d3dcwyy). The green create button is inactive below this; active at or
 * above it. While recording the count comes from the Deepgram live stream; after
 * stop it recalibrates to the Groq Whisper transcript (the source of truth).
 */
const WORD_GATE = 50;
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
  /** When opening from an existing idea row: preload its text + update that idea
   *  (instead of a fresh capture). Task 86d3cpv9x. */
  initialIdea?: { id: string; text: string } | null;
}

export default function BraindumpOverlay({ open, onClose, initialIdea = null }: BraindumpOverlayProps) {
  const [phase, setPhase] = useState<Phase>('A');
  const [text, setText] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  /** Live word count for the CURRENT recording segment (Deepgram). Reset to 0
   *  when a recording starts and again once Whisper recalibrates `text` on stop. */
  const [liveSegmentWords, setLiveSegmentWords] = useState(0);
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
  const deepgramRef = useRef<DeepgramLiveSession | null>(null);
  const textRef = useRef('');
  const typeTextarea = useRef<HTMLTextAreaElement>(null);
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // On open: either reopen an existing idea pre-loaded in result-state (so it
  // saves back to that idea + lets the user edit / promote), or start a fresh
  // capture with a new prompt.
  useEffect(() => {
    if (!open) return;
    const next = pickBraindumpPrompt(prevPromptRef.current);
    prevPromptRef.current = next;
    setPrompt(next);
    setInputMode('type');
    setError(null);
    setTypeStatus({ reels: 'idle', carousel: 'idle', stories: 'idle' });
    if (initialIdea) {
      setPhase('B');
      setText(initialIdea.text);
      setSavedId(initialIdea.id);
      setSaveStatus('saved');
    } else {
      setPhase('A');
      setText('');
      setInputMode('voice');
      setSaveStatus('idle');
      setSavedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    deepgramRef.current?.stop();
    deepgramRef.current = null;
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
        // Whisper is now the count source again — clear the live segment estimate
        // so the counter shows the recalibrated (accurate) Whisper-based count.
        setLiveSegmentWords(0);
      }
    },
    [appendTranscript]
  );

  const stopDeepgram = useCallback(() => {
    deepgramRef.current?.stop();
    deepgramRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      setLiveSegmentWords(0);

      // Live word counter (Deepgram) — best-effort, drives ONLY the counter/gate.
      // Groq Whisper (on stop) stays the saved-transcript source of truth. If the
      // key is unconfigured or anything fails, this is a no-op session and the
      // counter simply waits for the Whisper recalibration (never errors).
      const dg = await startDeepgramLive((w) => setLiveSegmentWords(w));
      deepgramRef.current = dg;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          deepgramRef.current?.send(e.data);
        }
      };
      recorder.onstop = () => {
        stopDeepgram();
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        stopStream();
        if (blob.size > 0) void transcribe(blob);
      };
      mediaRecorderRef.current = recorder;
      // Timeslice so chunks flow to Deepgram continuously while recording (and so
      // the final Whisper blob is still assembled from the same chunks on stop).
      recorder.start(250);
      setRecording(true);
    } catch {
      stopDeepgram();
      setError('Немає доступу до мікрофона. Дозволь доступ або введи текст.');
      setInputMode('type');
    }
  }, [stopStream, transcribe, stopDeepgram]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else stopDeepgram();
    setRecording(false);
  }, [stopDeepgram]);

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

  // Done → transition to State B and auto-save. Gated: a braindump must hold at
  // least WORD_GATE words before it can become content (task 86d3dcwyy). The
  // button is also visually disabled below the gate; this is the logic backstop.
  const handleDone = useCallback(() => {
    if (recording) stopRecording();
    if (countWords(text) < WORD_GATE) return;
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

  // While recording, the live (Deepgram) estimate adds to whatever was already
  // finalized by Whisper; once recording stops it recalibrates to the Whisper
  // count (liveSegmentWords resets to 0). A few words of drift is expected.
  const words = recording ? countWords(text) + liveSegmentWords : countWords(text);
  const canCreate = words >= WORD_GATE;

  return (
    // One shared full-screen scrim for EVERY page braindump can open from (it is
    // mounted once in BottomNav, so there is no per-page divergence). The tint is
    // a light NEUTRAL veil rather than pure white: pure white was invisible over
    // the white home page yet heavy over dark carousel slides. A neutral veil +
    // a calmer 14px blur reads consistently on both and isn't overpowering when
    // there's little behind it. Task 86d3b1wzp / 86d3a1acj.
    <BlurScrim zIndex={70} blurPx={14} tint="rgba(236,235,232,0.62)">
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

        {/* ── PINNED TOP: × close, saved confirmation, and (State A) the prompt
            title. Stays fixed at the top at any transcript length (task 86d3dezu4). */}
        <div className="relative z-10 shrink-0 px-5 pt-6">
          <div className="flex items-start justify-between">
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
          {phase === 'A' && (
            <h2
              data-testid="braindump-prompt"
              className="mt-2 px-1 text-2xl font-bold leading-snug tracking-tight text-black"
            >
              {prompt}
            </h2>
          )}
        </div>

        {/* ── SCROLLABLE MIDDLE: the transcript occupies the space between the
            pinned title and the pinned controls and scrolls INTERNALLY. A long
            transcript (100+, 200+ words) never grows the layout or covers the
            controls — it scrolls within this fixed-height region (task 86d3dezu4).
            `min-h-0` is what lets a flex child actually shrink and scroll. */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-6 pt-3">
          {phase === 'A' ? (
            inputMode === 'type' ? (
              <textarea
                ref={typeTextarea}
                data-testid="braindump-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Накидай ідею..."
                aria-label="Ідея"
                className="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent text-lg leading-relaxed text-zinc-500 outline-none placeholder:text-zinc-400"
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
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
              </div>
            )
          ) : (
            <textarea
              data-testid="braindump-edit"
              value={text}
              onChange={(e) => handleEditInB(e.target.value)}
              aria-label="Текст ідеї"
              className="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent text-xl font-semibold leading-snug tracking-tight text-black outline-none"
            />
          )}
        </div>

        {/* ── PINNED BOTTOM: mic + green create button + word counter (State A) or
            the content-type buttons (State B). Always visible and tappable at any
            transcript length; never covered by the transcript (tasks 86d3dezu4 +
            86d3dcwyy). `braindump-rise` keeps the original rise-from-bottom feel. */}
        <div
          className="relative z-10 shrink-0 px-6 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]"
          style={{ animation: 'braindump-rise 320ms ease-out both' }}
        >
          {error && (
            <p data-testid="braindump-error" className="mb-3 text-sm font-medium text-zinc-500">
              {error}
            </p>
          )}

          {phase === 'A' && (
            <>
              <div className="flex items-center justify-center gap-5 pb-3">
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
                {/* Green CREATE button — gated: inactive (greyed, non-tappable) below
                    WORD_GATE words, active at or above it (task 86d3dcwyy). */}
                <button
                  type="button"
                  onClick={handleDone}
                  data-testid="braindump-done"
                  aria-label="Створити контент"
                  aria-disabled={!canCreate || transcribing}
                  disabled={!canCreate || transcribing}
                  className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
                  style={{ backgroundColor: 'var(--success)' }}
                >
                  <Check className="h-7 w-7" strokeWidth={2.4} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span
                  data-testid="braindump-counter"
                  className="text-xs font-medium tabular-nums"
                  style={{ color: canCreate ? 'var(--success)' : '#a1a1aa' }}
                >
                  {words}/{WORD_GATE}
                </span>

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
              </div>
            </>
          )}

          {phase === 'B' && (
            <>
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
            </>
          )}
        </div>
      </div>
    </BlurScrim>
  );
}
