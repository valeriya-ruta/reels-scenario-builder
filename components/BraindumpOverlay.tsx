'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Keyboard, Check, X, ArrowLeft, PenLine } from 'lucide-react';
import { pickBraindumpPrompt } from '@/lib/braindumpPrompts';
import { dayHeaderLabel } from '@/lib/content/calendar';
import { countWords, BRAINDUMP_WORD_TARGET } from '@/lib/braindump/wordGate';
import { CONTENT_TYPES, CONTENT_TYPE_ORDER, type ContentType } from '@/lib/contentTypes';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import BlurScrim from '@/components/BlurScrim';
import ProposalList from '@/components/propose/ProposalList';
import { useProposals } from '@/components/propose/useProposals';
import type { Proposal } from '@/lib/propose/types';
import FanOutReview from '@/components/braindump/FanOutReview';
import ResultReview, { type ResultPreview } from '@/components/braindump/ResultReview';
import { generateReelFromRant } from '@/app/actions';
import {
  createStorytellingProjectFromRant,
  type CreatedStorytellingDay,
} from '@/app/storytelling-actions';
import { createCarouselProjectFromRant } from '@/app/carousel-actions';
import {
  linkIdeaToMany,
  getIdeaContentLinks,
  getIdeaChildren,
  type IdeaChild,
} from '@/app/ideas-actions';
import type { CarouselRantOutput } from '@/lib/carouselTypes';

/**
 * Braindump overlay (task 86d38zghd) — voice-primary quick capture.
 *
 * NOT a route / not a hard modal-card: a full-screen blur overlay with elements
 * rising from the bottom. Three states on one continuous surface:
 *   State P (propose) — THE FRONT DOOR. Ruta's proposed angles, each with a
 *     one-line rationale, tappable. Capture is demoted to a secondary «або
 *     наговори своє» affordance underneath. The user never faces a blank box.
 *   State A (capture) — the chosen angle pinned as the heading (or a rotating
 *     prompt when the user brought their own thought), mic affordance, gray
 *     transcript, word counter (n/50), keyboard/voice toggle, green check.
 *   State B (result) — text turns black & rises to the title position, auto-saved
 *     to ideas (faint "✓ Збережено в ідеї"), three independent content-type
 *     buttons that turn green when they create/queue that type.
 *
 * Voice reuses the existing Groq Whisper path via /api/ideas/transcribe
 * (whisper-large-v3-turbo, uk). Mic capture (MediaRecorder) is the only net-new
 * audio code. Auto-save posts to /api/ideas/braindump.
 */

const SOFT_WORD_TARGET = BRAINDUMP_WORD_TARGET;
/** MediaRecorder timeslice — how often audio chunks become available. */
const LIVE_COUNT_CHUNK_MS = 1000;
/** How often the live counter asks for an interim read while recording. */
const LIVE_COUNT_POLL_MS = 6000;
const ACCENT = '#004BA8';

type Phase = 'P' | 'A' | 'B';
type InputMode = 'voice' | 'type';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type TypeStatus = 'idle' | 'loading' | 'done' | 'error';

/** One created piece, shown in the braindump's inline receipt. */
type ReceiptEntry = {
  type: ContentType;
  id: string;
  label: string;
  /** 'YYYY-MM-DD' when the piece was auto-scheduled (stories). */
  date?: string;
  /** Number of story cards (stories only). */
  count?: number;
  /** e.g. 2 of 3 — marks pieces generated together as one set. */
  indexInSet?: number;
  setSize?: number;
};

/**
 * The result currently being reviewed in place. `fanout` is the multi-day case
 * (one dump → 2–3 dated stories); `single` covers a reel or a carousel.
 */
type ReviewState =
  | null
  | { kind: 'single'; preview: ResultPreview }
  | { kind: 'fanout'; days: CreatedStorytellingDay[]; reason: string; consecutive: boolean };

/** «Звідси: 3 сторіс · 1 карусель» — the dump's fan-out in one line. */
function fanOutSummary(children: IdeaChild[]): string {
  const counts = new Map<ContentType, number>();
  for (const c of children) counts.set(c.contentType, (counts.get(c.contentType) ?? 0) + 1);
  const parts = CONTENT_TYPE_ORDER.filter((t) => counts.has(t)).map(
    (t) => `${counts.get(t)} ${CONTENT_TYPES[t].label.toLowerCase()}`,
  );
  return `Звідси: ${parts.join(' · ')}`;
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
  /** An angle the user already confirmed elsewhere (a proposing empty state):
   *  skip the deck and open straight on capture with it pinned. */
  initialAngle?: Proposal | null;
}

export default function BraindumpOverlay({
  open,
  onClose,
  initialIdea = null,
  initialAngle = null,
}: BraindumpOverlayProps) {
  const [phase, setPhase] = useState<Phase>('P');
  const [text, setText] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [recording, setRecording] = useState(false);
  // Words heard so far, updated while recording (§4). Reset on each take.
  const [liveWords, setLiveWords] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The angle the user confirmed from the proposal deck; null = own thought.
  const [angle, setAngle] = useState<Proposal | null>(null);
  // Only fetch proposals when the overlay is actually opening on the deck —
  // reopening an existing idea goes straight to State B.
  const { proposals, loading: proposalsLoading, refresh: refreshProposals } = useProposals(
    open && !initialIdea && !initialAngle,
  );

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [typeStatus, setTypeStatus] = useState<Record<ContentType, TypeStatus>>({
    reels: 'idle',
    carousel: 'idle',
    stories: 'idle',
  });
  // Inline receipt — what each type actually produced. Nothing is created
  // silently: a saga of 3 days shows all 3 dated links right here. It
  // accumulates because you can fire several types off one braindump, so there
  // is no single "done" moment to interrupt with a screen.
  const [receipt, setReceipt] = useState<ReceiptEntry[]>([]);
  // The result currently under review. Nothing generated is final-on-arrival:
  // it is a proposal the user Keeps / Regenerates / Tweaks in place.
  const [review, setReview] = useState<ReviewState>(null);
  // Everything this dump already produced, when reopening a saved one.
  const [children, setChildren] = useState<IdeaChild[]>([]);

  const prevPromptRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const textRef = useRef('');
  const typeTextarea = useRef<HTMLTextAreaElement>(null);
  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The transcript lives in a fixed-height scroll region; keep the newest text
  // in view as it grows so a long transcript never hides behind the fold.
  const scrollRef = useRef<HTMLDivElement>(null);
  // Types whose generation is in flight (see runType — a ref, not state).
  const inFlight = useRef<Set<ContentType>>(new Set());
  // Live word counter plumbing (§4).
  const liveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveInFlight = useRef(false);
  // Set when «готово» is pressed mid-recording; consumed once the transcript
  // arrives (see the effect under handleDone).
  const pendingDone = useRef(false);

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
    setReceipt([]);
    setReview(null);
    pendingDone.current = false;
    setLiveWords(0);
    setChildren([]);
    setAngle(initialAngle);
    if (initialIdea) {
      setPhase('B');
      setText(initialIdea.text);
      setSavedId(initialIdea.id);
      setSaveStatus('saved');
      // Reflect content already created from this idea: mark those types 'done'
      // so we show the created state instead of offering a duplicate (86d3czf1e).
      void getIdeaContentLinks(initialIdea.id).then((types) => {
        if (types.length === 0) return;
        setTypeStatus((s) => {
          const next = { ...s };
          for (const t of types) next[t] = 'done';
          return next;
        });
      });
      // A braindump is not consumed on generation — it OWNS what it produced.
      // Reopening it shows the fan-out, so the dump compounds instead of
      // vanishing into whatever it made first.
      void getIdeaChildren(initialIdea.id).then(setChildren);
    } else {
      // Proposals are the front door — unless an angle was already confirmed
      // upstream, in which case re-asking would be a step backwards.
      setPhase(initialAngle ? 'A' : 'P');
      setText('');
      setInputMode('voice');
      setSaveStatus('idle');
      setSavedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stopLiveCount = useCallback(() => {
    if (liveTimer.current) {
      clearInterval(liveTimer.current);
      liveTimer.current = null;
    }
    liveInFlight.current = false;
  }, []);

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

  /**
   * Live word counter while speaking (§4, task 86d3wadg3).
   *
   * Every few seconds the audio captured SO FAR is sent for an interim pass and
   * the count is updated. It kills the speak → stop → check → speak loop: the
   * number moves while she is still talking, so she knows when she has enough.
   *
   * The interim result is deliberately a NUMBER only — the saved transcript
   * still comes from the single Whisper pass on stop, so a lossy interim read
   * can never corrupt what gets stored.
   */
  const startLiveCount = useCallback((mimeType: string) => {
    stopLiveCount();
    liveTimer.current = setInterval(() => {
      if (liveInFlight.current || chunksRef.current.length === 0) return;
      liveInFlight.current = true;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const fd = new FormData();
      fd.append('audio', blob, 'live.webm');
      fetch('/api/ideas/live-count', { method: 'POST', body: fd })
        .then((r) => r.json())
        .then((data: { words?: number | null }) => {
          // Never let the counter go backwards: a truncated interim pass can
          // read fewer words than the previous one, and a number that dips
          // mid-sentence reads as the app losing what you just said.
          if (typeof data.words === 'number') {
            setLiveWords((prev) => Math.max(prev, data.words as number));
          }
        })
        .catch(() => {
          /* interim passes are allowed to fail silently */
        })
        .finally(() => {
          liveInFlight.current = false;
        });
    }, LIVE_COUNT_POLL_MS);
  }, [stopLiveCount]);

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
        stopLiveCount();
        if (blob.size > 0) void transcribe(blob);
      };
      mediaRecorderRef.current = recorder;
      // Timeslice so chunks land continuously — the live counter needs audio
      // available WHILE recording, not only on stop.
      recorder.start(LIVE_COUNT_CHUNK_MS);
      setRecording(true);
      setLiveWords(0);
      startLiveCount(mime || 'audio/webm');
    } catch {
      setError('Немає доступу до мікрофона. Дозволь доступ або введи текст.');
      setInputMode('type');
    }
  }, [stopStream, transcribe, startLiveCount, stopLiveCount]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
    stopLiveCount();
  }, [stopLiveCount]);

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
        // The confirmed angle is stored as the idea's `title` — the column 019
        // reserved for exactly this ("future list/swipe-deck labels"). It gives
        // every dump a real name in lists instead of an 80-char text slice.
        const title = angle?.title ?? null;
        const res = await fetch('/api/ideas/braindump', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            id ? { id, content: trimmed, title } : { content: trimmed, title },
          ),
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
    [angle]
  );

  /**
   * Done → State B + auto-save.
   *
   * The live counter (§4) can satisfy the 50-word gate while recording is still
   * running, at which point `text` is still EMPTY — the real transcript only
   * arrives from the Whisper pass on stop. So pressing done mid-take stops the
   * recorder and defers the transition until that transcript lands, instead of
   * refusing with "спочатку запиши" over words she has just said.
   */
  const handleDone = useCallback(() => {
    if (recording) {
      stopRecording();
      pendingDone.current = true;
      return;
    }
    if (!text.trim()) {
      setError('Спочатку запиши або введи ідею.');
      return;
    }
    setPhase('B');
    void saveIdea(text, null);
  }, [recording, stopRecording, text, saveIdea]);

  // The deferred half of handleDone: fires once the post-stop transcript exists.
  useEffect(() => {
    if (!pendingDone.current || transcribing) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    pendingDone.current = false;
    setPhase('B');
    void saveIdea(trimmed, null);
  }, [text, transcribing, saveIdea]);

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

  // --- Proposal deck → capture ---

  /**
   * Confirm one of Ruta's angles. The angle becomes the heading of the capture
   * screen; the user's own words are what get recorded. The seed is deliberately
   * NOT poured into the transcript: the 50-word gate must measure what SHE said,
   * not what we suggested.
   */
  const pickAngle = useCallback((proposal: Proposal) => {
    setAngle(proposal);
    setPhase('A');
    setInputMode('voice');
    setError(null);
  }, []);

  /** «Або наговори своє» — the demoted free-capture affordance. */
  const startOwnThought = useCallback(() => {
    setAngle(null);
    setPhase('A');
    setInputMode('voice');
    setError(null);
  }, []);

  const backToProposals = useCallback(() => {
    if (recording) stopRecording();
    setPhase('P');
    setError(null);
  }, [recording, stopRecording]);

  // --- Content-type creation (independent, non-exclusive, no navigation) ---
  const runType = useCallback(
    async (type: ContentType, force = false) => {
      // In-flight is tracked in a ref, not in state: «Ще раз» must be able to
      // re-run a type the same tick it clears the previous result, and a state
      // read would still see the stale 'done'.
      if (inFlight.current.has(type)) return;
      if (!force && typeStatus[type] === 'done') return;
      inFlight.current.add(type);
      const spoken = textRef.current.trim();
      if (!spoken) {
        inFlight.current.delete(type);
        return;
      }
      // Carry the confirmed angle into generation as a plain directive line, so
      // the output follows the direction the user actually agreed to rather than
      // whatever the model infers from raw speech.
      const snapshot = angle ? `Кут подачі: ${angle.title}\n\n${spoken}` : spoken;
      setTypeStatus((s) => ({ ...s, [type]: 'loading' }));
      try {
        let ok = false;
        // Every id this run produced — a saga is several, and the dump owns them
        // all (which is what migration 026 widens the link table for).
        let createdIds: string[] = [];
        if (type === 'reels') {
          const r = await generateReelFromRant(snapshot);
          ok = r.ok;
          if (r.ok) {
            createdIds = [r.projectId];
            setReceipt((cur) => [...cur, { type, id: r.projectId, label: r.name }]);
            setReview({
              kind: 'single',
              preview: {
                type: 'reels',
                id: r.projectId,
                name: r.name,
                lead: r.hook,
                countLabel: `${r.sceneCount} сцен`,
                rationale: 'Хук окремою сценою, один CTA у кінці — як ти знімаєш.',
                scheduledDate: null,
              },
            });
          }
        } else if (type === 'stories') {
          // The angle doubles as the storytelling's emotional-goal name.
          const r = await createStorytellingProjectFromRant(snapshot, angle?.title ?? '');
          ok = r.ok;
          if (r.ok) {
            createdIds = r.days.map((d) => d.id);
            setReceipt((cur) => [
              ...cur,
              ...r.days.map((d, i) => ({
                type,
                id: d.id,
                label: d.name,
                date: d.scheduledDate,
                count: d.storyCount,
                indexInSet: i + 1,
                setSize: r.days.length,
              })),
            ]);
            setReview({ kind: 'fanout', days: r.days, reason: r.reason, consecutive: r.consecutive });
          }
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
            if (created.ok) {
              createdIds = [created.projectId];
              setReceipt((cur) => [
                ...cur,
                { type, id: created.projectId, label: created.name },
              ]);
              setReview({
                kind: 'single',
                preview: {
                  type: 'carousel',
                  id: created.projectId,
                  name: created.name,
                  lead: created.coverTitle,
                  sub: created.coverBody,
                  countLabel: `${created.slideCount} слайдів`,
                  rationale: 'Одна думка — один слайд, обкладинка тримає гачок.',
                  scheduledDate: null,
                },
              });
            }
          }
        }
        setTypeStatus((s) => ({ ...s, [type]: ok ? 'done' : 'error' }));
        // Persist the idea → content link so the dump OWNS what it produced:
        // reopening it shows the fan-out, and every piece can name its source.
        if (ok && createdIds.length > 0 && savedId) {
          void linkIdeaToMany(savedId, type, createdIds);
        }
      } catch {
        setTypeStatus((s) => ({ ...s, [type]: 'error' }));
      } finally {
        inFlight.current.delete(type);
      }
    },
    [typeStatus, savedId, angle]
  );

  /**
   * «Ще раз» — re-propose the same type. The previous attempt is NOT deleted:
   * it stays a real linked child of the dump, so regenerating never silently
   * destroys work the user might still want.
   */
  const regenerate = useCallback(
    (type: ContentType) => {
      setReview(null);
      void runType(type, true);
    },
    [runType],
  );

  /** «Підкрутити» — back to the thought itself, the only text box in the flow. */
  const tweak = useCallback(() => {
    setReview(null);
  }, []);

  // Keep the transcript scrolled to its newest content (State A) so appended
  // speech stays visible without the user having to scroll down each time.
  useEffect(() => {
    if (phase !== 'A') return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text, phase, inputMode]);

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
  // While recording, the transcript is still empty (it arrives on stop), so the
  // counter reads from the live interim count instead. Whichever is larger wins,
  // which also covers re-recording on top of an existing transcript.
  const displayWords = recording ? Math.max(words, liveWords) : words;
  // 50-word gate (task 86d3dcwyy): a braindump must reach the target before the
  // user can turn it into content. The green "done/create" arrow is inactive
  // below the threshold and flips active at ≥50 as the count ticks up.
  const reachedWordGate = displayWords >= SOFT_WORD_TARGET;

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

        {/* Top bar: × close (+ saved confirmation in State B). Stays pinned at the
            top — only the content+controls below rise from the bottom. */}
        {/* Top strip carries STATUS only. Exit and «інші напрямки» are repeated
            controls, so they live in the bottom thumb zone (§2) — top corners on
            a phone are the hardest place to reach one-handed. */}
        <div className="relative z-10 flex h-7 shrink-0 items-center px-5 pt-6">
          {phase === 'B' && saveStatus === 'saved' && (
            <span data-testid="braindump-saved" className="text-xs font-medium text-zinc-400">
              ✓ Збережено в ідеї
            </span>
          )}
        </div>

        {/* The rising block fills the space under the pinned top bar and splits
            into a SCROLLABLE transcript region + a PINNED controls footer. A long
            transcript now scrolls inside its own fixed-height region instead of
            growing to fill the screen and shoving the mic / green check / word
            counter off-screen (86d3dezu4). `mt-auto` keeps short content
            bottom-biased so the layout reads unchanged at small lengths. */}
        <div
          className="relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-[40px]"
          style={{ animation: 'braindump-rise 320ms ease-out both' }}
        >
          {/* Scrollable transcript region — occupies the space between the title
              and the pinned controls; scrolls internally when text is long. */}
          <div
            ref={scrollRef}
            data-testid="braindump-scroll"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          >
            <div className="mt-auto pb-4">
              {phase === 'P' ? (
                <div data-testid="braindump-propose">
                  <h2 className="text-2xl font-bold leading-snug tracking-tight text-black">
                    Ось із чого я б почала
                  </h2>
                  <p className="mt-1.5 text-[13px] leading-snug text-zinc-500">
                    Обери напрямок — далі просто наговори своїми словами.
                  </p>
                  <div className="mt-4">
                    <ProposalList
                      proposals={proposals}
                      loading={proposalsLoading}
                      onPick={pickAngle}
                    />
                  </div>
                </div>
              ) : phase === 'A' ? (
                <>
                  <h2
                    data-testid="braindump-prompt"
                    className="text-2xl font-bold leading-snug tracking-tight text-black"
                  >
                    {angle ? angle.title : prompt}
                  </h2>
                  {angle ? (
                    <p className="mt-1.5 text-[12.5px] leading-snug text-zinc-500">
                      {angle.rationale}
                    </p>
                  ) : null}
                </>
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
            </div>
          </div>

          {/* Pinned controls footer — never scrolls away, never covered. Also
              carries the exit and the back-to-proposals affordance, both of
              which used to sit in the top corners (§2). */}
          <div className="shrink-0 pt-3">
            {error && (
              <p data-testid="braindump-error" className="mb-3 text-sm font-medium text-zinc-500">
                {error}
              </p>
            )}

            {/* ONE exit, bottom-left, identical position on every braindump
                screen (§6). Its meaning is always "back one step": from capture
                that is the proposal deck; from the deck (or a result) there is
                nowhere back to, so it closes. Previously the capture screen
                carried BOTH an × and a separate back control, which is what made
                the two screens disagree with each other. */}
            <div className="mb-3 flex items-center">
              <button
                type="button"
                onClick={phase === 'A' ? backToProposals : close}
                data-testid={phase === 'A' ? 'braindump-back-to-proposals' : 'braindump-close'}
                aria-label={phase === 'A' ? 'Інші напрямки' : 'Закрити'}
                className="app-pill py-2 text-[12.5px]"
              >
                {phase === 'A' ? (
                  <>
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Інші напрямки
                  </>
                ) : (
                  <>
                    <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Закрити
                  </>
                )}
              </button>
            </div>

            {/* State P controls: capture is deliberately SECONDARY here — a quiet
                outlined row under the proposals, never the primary action. */}
            {phase === 'P' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startOwnThought}
                  data-testid="braindump-own-thought"
                  className="app-pill flex-1 justify-center py-2.5"
                >
                  <PenLine className="h-4 w-4" strokeWidth={2} />
                  Або наговори своє
                </button>
                <button
                  type="button"
                  onClick={() => void refreshProposals()}
                  disabled={proposalsLoading}
                  data-testid="braindump-refresh-proposals"
                  aria-label="Інші напрямки"
                  title="Інші напрямки"
                  className="app-icon-btn"
                >
                  <svg
                    className={`h-4 w-4 ${proposalsLoading ? 'animate-spin' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                </button>
              </div>
            )}

            {/* State A controls (task 86d3a1aqk): mic (primary) with the green
                "done" check BESIDE it, the word counter bottom-LEFT and the
                keyboard/voice toggle bottom-RIGHT. */}
            {phase === 'A' && (
              <div>
                <div className="flex items-center justify-center gap-5 pb-4">
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
                <button
                  type="button"
                  onClick={handleDone}
                  data-testid="braindump-done"
                  aria-label="Готово"
                  disabled={transcribing || !reachedWordGate}
                  title={reachedWordGate ? 'Готово' : `Треба щонайменше ${SOFT_WORD_TARGET} слів`}
                  className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: 'var(--success)' }}
                >
                  <Check className="h-7 w-7" strokeWidth={2.4} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                {/* While recording, this shows the LIVE count (§4) — the number
                    moves as she talks, so she knows when she has enough without
                    the speak → stop → check → speak loop. On stop it becomes the
                    real transcript's count. */}
                <span
                  data-testid="braindump-counter"
                  data-reached={reachedWordGate ? 'true' : 'false'}
                  data-live={recording ? 'true' : 'false'}
                  className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums transition-colors"
                  style={{ color: reachedWordGate ? 'var(--success)' : '#a1a1aa' }}
                >
                  {recording ? (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: reachedWordGate ? 'var(--success)' : ACCENT,
                        animation: 'reels-planner-scene-glow 1.4s ease-in-out infinite',
                      }}
                    />
                  ) : null}
                  {displayWords}/{SOFT_WORD_TARGET}
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
            </div>
          )}

            {/* State B — review first. A result that just arrived is a PROPOSAL:
                the user Keeps / Regenerates / Tweaks it in place before the
                type buttons come back for the next format. */}
            {phase === 'B' && review !== null && (
              <div data-testid="braindump-review">
                {review.kind === 'fanout' ? (
                  <FanOutReview
                    days={review.days}
                    reason={review.reason}
                    consecutive={review.consecutive}
                    onDone={() => setReview(null)}
                    onRegenerate={() => regenerate('stories')}
                    onTweak={tweak}
                    regenerating={typeStatus.stories === 'loading'}
                  />
                ) : (
                  <ResultReview
                    preview={review.preview}
                    onKeep={() => setReview(null)}
                    onRegenerate={() => regenerate(review.preview.type)}
                    onTweak={tweak}
                    regenerating={typeStatus[review.preview.type] === 'loading'}
                  />
                )}
              </div>
            )}

            {/* State B controls: three independent content-type buttons. */}
            {phase === 'B' && review === null && (
              <div>
              {saveStatus === 'error' && (
                <p className="mb-3 text-sm font-medium text-zinc-500">
                  Не вдалося зберегти — текст збережено локально, спробуй ще раз.
                </p>
              )}
              {/* What this dump already produced — the fan-out, traceable both
                  ways. A dump is a compounding object, not a one-shot input. */}
              {children.length > 0 && (
                <div className="mb-3" data-testid="braindump-fanout">
                  <p className="mb-1.5 text-[12px] font-semibold text-[color:var(--text-secondary)]">
                    {fanOutSummary(children)}
                  </p>
                  <div className="rounded-[14px] border border-[color:var(--border)] bg-white/80 p-1.5">
                    {children.map((child) => (
                      <a
                        key={child.contentId}
                        href={CONTENT_TYPES[child.contentType].itemHref(child.contentId)}
                        data-testid="braindump-child"
                        className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-[color:var(--surface1)]"
                      >
                        <ContentTypeIcon type={child.contentType} size={16} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[color:var(--foreground)]">
                          {child.title}
                        </span>
                        {child.scheduledDate ? (
                          <span className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
                            {dayHeaderLabel(child.scheduledDate)}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
                            без дати
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                  {/* 2.3 — a dump that produced a published piece is a proven
                      seed. Going deeper starts WITH its context, not cold. */}
                  {children.some((c) => c.status === 'published') && (
                    <p
                      data-testid="braindump-proven"
                      className="mt-2 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--accent-soft)] px-3 py-2 text-[12.5px] leading-snug text-[color:var(--foreground)]"
                    >
                      ✻ Звідси вже вийшло опубліковане. Тут явно є що копнути глибше — додай
                      думку і зроби ще один формат.
                    </p>
                  )}
                </div>
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
                      className="flex flex-col items-center gap-2 rounded-[16px] border-2 px-2 py-4 text-[13px] font-semibold transition-colors"
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

              {/* Inline receipt — created pieces, tappable. A saga lists every
                  dated day, so multi-day generation is never invisible. */}
              {receipt.length > 0 && (
                <div className="mt-3 rounded-[14px] border border-[color:var(--border)] bg-white/80 p-1.5">
                  {receipt.map((r) => (
                    <a
                      key={`${r.type}-${r.id}`}
                      href={CONTENT_TYPES[r.type].itemHref(r.id)}
                      data-testid="braindump-receipt-item"
                      className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-[color:var(--surface1)]"
                    >
                      <ContentTypeIcon type={r.type} size={18} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[color:var(--foreground)]">
                          {r.label}
                          {r.setSize && r.setSize > 1 ? (
                            <span className="ml-1.5 rounded-[5px] bg-[color:var(--surface2)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[color:var(--text-secondary)]">
                              {r.indexInSet}/{r.setSize}
                            </span>
                          ) : null}
                        </span>
                        {r.date ? (
                          <span className="mt-0.5 block text-[11px] text-[color:var(--text-muted)]">
                            {dayHeaderLabel(r.date)}
                            {typeof r.count === 'number' ? ` · ${r.count} сторіс` : ''}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[color:var(--text-muted)]">→</span>
                    </a>
                  ))}
                </div>
              )}
              </div>
            )}
          </div>
        </div>
      </div>
    </BlurScrim>
  );
}
