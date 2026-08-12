'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Link as LinkIcon, RotateCw, X } from 'lucide-react';
import BlurScrim from '@/components/BlurScrim';
import ContentTypeIcon from '@/components/ContentTypeIcon';
import MaterialIcon from '@/components/ui/MaterialIcon';
import ResultReview, { type ResultPreview } from '@/components/braindump/ResultReview';
import FanOutReview from '@/components/braindump/FanOutReview';
import ThreadReview from '@/components/repurpose/ThreadReview';
import {
  REPURPOSE_SOURCES,
  REPURPOSE_TARGETS,
  TARGETS_BY_SOURCE,
  isContentTypeTarget,
  type RepurposeTarget,
} from '@/lib/repurpose/types';
import { detectRepurposeSource, UNSUPPORTED_SOURCE_MESSAGE } from '@/lib/repurpose/sourceUrl';
import { composeRepurposeBrief, repurposeName } from '@/lib/repurpose/compose';
import { CONTENT_TYPES } from '@/lib/contentTypes';
import { dayHeaderLabel } from '@/lib/content/calendar';
import {
  extractRepurposeSource,
  generateThreadPost,
  recordRepurposeOutputs,
  type RepurposeSourcePayload,
} from '@/app/repurpose-actions';
import { generateReelFromRant } from '@/app/actions';
import { createCarouselProjectFromRant } from '@/app/carousel-actions';
import {
  createStorytellingProjectFromRant,
  type CreatedStorytellingDay,
} from '@/app/storytelling-actions';
import type { CarouselRantOutput } from '@/lib/carouselTypes';

/**
 * Repurpose overlay — one published post in, a new format out.
 *
 * Same surface and same grammar as the braindump overlay (blur scrim, content
 * rising from the bottom, one exit bottom-left, results reviewed in place with
 * Лишаємо / Ще раз / Підкрутити) because it is the same job with a different raw
 * material: braindump starts from your voice, this starts from a link.
 *
 * Two states on one surface:
 *   State L (link)   — paste a post. The kind is detected AS YOU TYPE from the
 *                      URL alone, so the user knows we understood the link
 *                      before spending a minute on scraping and transcription.
 *   State S (source) — the post's own words, editable (a Whisper transcript is
 *                      never perfect, and the fix belongs here, before
 *                      generation, not after). Under it: the formats this source
 *                      can become — a reel offers carousel/thread/storytelling,
 *                      a thread offers carousel/reel/storytelling. Its own
 *                      format is never on the list.
 *
 * Generation reuses the app's EXISTING generators unchanged (the same server
 * actions and the same carousel route the braindump calls); only the Threads
 * output is new. What gets made is linked back to the source, so a repurposed
 * post carries the same fan-out a braindump does.
 */

type Phase = 'link' | 'source';
type TargetStatus = 'idle' | 'loading' | 'done' | 'error';

type ReviewState =
  | null
  | { kind: 'single'; preview: ResultPreview }
  | { kind: 'fanout'; days: CreatedStorytellingDay[]; reason: string; consecutive: boolean }
  | { kind: 'thread'; title: string; posts: string[] };

type ReceiptEntry = {
  target: RepurposeTarget;
  id: string;
  label: string;
  date?: string;
  indexInSet?: number;
  setSize?: number;
};

const ALL_TARGETS: RepurposeTarget[] = ['carousel', 'reels', 'stories', 'threads'];

const IDLE_STATUS: Record<RepurposeTarget, TargetStatus> = {
  carousel: 'idle',
  reels: 'idle',
  stories: 'idle',
  threads: 'idle',
};

const ERROR_RED = '#dc2626';

interface RepurposeOverlayProps {
  open: boolean;
  onClose: () => void;
  /** A link the caller already has (share target, a posted-link row). */
  initialUrl?: string | null;
}

export default function RepurposeOverlay({ open, onClose, initialUrl = null }: RepurposeOverlayProps) {
  const [phase, setPhase] = useState<Phase>('link');
  const [url, setUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [source, setSource] = useState<RepurposeSourcePayload | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [targetStatus, setTargetStatus] = useState<Record<RepurposeTarget, TargetStatus>>(IDLE_STATUS);
  const [receipt, setReceipt] = useState<ReceiptEntry[]>([]);
  const [review, setReview] = useState<ReviewState>(null);

  // The saved source idea — created on the FIRST successful generation and
  // reused for every later one, so one pasted post owns everything it produced.
  const sourceIdeaId = useRef<string | null>(null);
  // In-flight targets live in a ref, not state: «Ще раз» must be able to re-run a
  // target the same tick it clears the previous result (a state read would still
  // see the stale 'done').
  const inFlight = useRef<Set<RepurposeTarget>>(new Set());
  const textRef = useRef('');
  const urlInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Reset on every open, then focus the box: this flow always starts at a link.
  useEffect(() => {
    if (!open) return;
    setPhase('link');
    setUrl(initialUrl ?? '');
    setExtracting(false);
    setSource(null);
    setText('');
    setError(null);
    setRetryable(false);
    setTargetStatus(IDLE_STATUS);
    setReceipt([]);
    setReview(null);
    sourceIdeaId.current = null;
    inFlight.current.clear();
    const t = setTimeout(() => urlInput.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [open, initialUrl]);

  // Lock body scroll while open (same as the braindump overlay).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const detected = useMemo(() => detectRepurposeSource(url), [url]);
  const detectedMeta = detected.ok ? REPURPOSE_SOURCES[detected.kind] : null;
  const targets = source ? TARGETS_BY_SOURCE[source.kind] : [];

  const extract = useCallback(async () => {
    if (!detected.ok) {
      setError(UNSUPPORTED_SOURCE_MESSAGE);
      setRetryable(false);
      return;
    }
    setExtracting(true);
    setError(null);
    setRetryable(false);
    try {
      const res = await extractRepurposeSource(detected.canonicalUrl);
      if (!res.ok) {
        setError(res.error);
        setRetryable(res.errorKind === 'system');
        return;
      }
      setSource(res.data);
      setText(res.data.text);
      setPhase('source');
    } catch (e) {
      console.error('Repurpose extract failed', e);
      setError('Йой, щось пішло не так! Спробуй ще раз через хвилинку.');
      setRetryable(true);
    } finally {
      setExtracting(false);
    }
  }, [detected]);

  /** Persist the source + link what it produced. Never blocks the result. */
  const record = useCallback(
    async (target: RepurposeTarget, ids: string[]) => {
      if (!source) return;
      const res = await recordRepurposeOutputs({
        ideaId: sourceIdeaId.current,
        kind: source.kind,
        sourceUrl: source.sourceUrl,
        author: source.author,
        text: textRef.current,
        contentType: isContentTypeTarget(target) ? target : undefined,
        contentIds: isContentTypeTarget(target) ? ids : undefined,
      });
      if (res.ok) sourceIdeaId.current = res.ideaId;
    },
    [source],
  );

  const runTarget = useCallback(
    async (target: RepurposeTarget, force = false) => {
      if (!source) return;
      if (inFlight.current.has(target)) return;
      if (!force && targetStatus[target] === 'done') return;

      const spoken = textRef.current.trim();
      if (!spoken) {
        setError('Спочатку встав або впиши текст оригіналу.');
        return;
      }

      inFlight.current.add(target);
      setError(null);
      setTargetStatus((s) => ({ ...s, [target]: 'loading' }));

      const brief = composeRepurposeBrief({
        kind: source.kind,
        target,
        sourceUrl: source.sourceUrl,
        author: source.author,
        text: spoken,
        caption: source.caption,
      });

      try {
        let ok = false;
        let createdIds: string[] = [];

        if (target === 'reels') {
          const r = await generateReelFromRant(brief);
          ok = r.ok;
          if (r.ok) {
            createdIds = [r.projectId];
            setReceipt((cur) => [...cur, { target, id: r.projectId, label: r.name }]);
            setReview({
              kind: 'single',
              preview: {
                type: 'reels',
                id: r.projectId,
                name: r.name,
                lead: r.hook,
                countLabel: `${r.sceneCount} сцен`,
                rationale: REPURPOSE_TARGETS.reels.rationale,
                scheduledDate: null,
              },
            });
          } else {
            setError(r.error);
          }
        } else if (target === 'stories') {
          const r = await createStorytellingProjectFromRant(brief, repurposeName(source.kind, 'stories'));
          ok = r.ok;
          if (r.ok) {
            createdIds = r.days.map((d) => d.id);
            setReceipt((cur) => [
              ...cur,
              ...r.days.map((d, i) => ({
                target,
                id: d.id,
                label: d.name,
                date: d.scheduledDate,
                indexInSet: i + 1,
                setSize: r.days.length,
              })),
            ]);
            setReview({ kind: 'fanout', days: r.days, reason: r.reason, consecutive: r.consecutive });
          } else {
            setError(r.error);
          }
        } else if (target === 'carousel') {
          // Same route the braindump calls: carousel generation is a reasoning
          // model with a 60s function budget, which a server action cannot give it.
          const res = await fetch('/api/carousel/rant-to-slides', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ rant: brief }),
          });
          const data = (await res.json()) as CarouselRantOutput & { error?: string };
          if (res.ok && data.slides?.length) {
            const created = await createCarouselProjectFromRant(data, brief);
            ok = created.ok;
            if (!created.ok) setError('Слайди згенеровано, але не вдалося зберегти карусель.');
            if (created.ok) {
              createdIds = [created.projectId];
              setReceipt((cur) => [...cur, { target, id: created.projectId, label: created.name }]);
              setReview({
                kind: 'single',
                preview: {
                  type: 'carousel',
                  id: created.projectId,
                  name: created.name,
                  lead: created.coverTitle,
                  sub: created.coverBody,
                  countLabel: `${created.slideCount} слайдів`,
                  rationale: REPURPOSE_TARGETS.carousel.rationale,
                  scheduledDate: null,
                },
              });
            }
          } else {
            setError(data.error ?? 'Не вдалося згенерувати слайди.');
          }
        } else {
          const r = await generateThreadPost(brief, {
            kind: source.kind,
            sourceUrl: source.sourceUrl,
            author: source.author,
          });
          ok = r.ok;
          if (r.ok) {
            createdIds = [r.ideaId];
            setReceipt((cur) => [...cur, { target, id: r.ideaId, label: r.title }]);
            setReview({ kind: 'thread', title: r.title, posts: r.posts });
          } else {
            setError(r.error);
          }
        }

        setTargetStatus((s) => ({ ...s, [target]: ok ? 'done' : 'error' }));
        if (ok) void record(target, createdIds);
      } catch (e) {
        console.error('Repurpose generation failed', e);
        setTargetStatus((s) => ({ ...s, [target]: 'error' }));
      } finally {
        inFlight.current.delete(target);
      }
    },
    [source, targetStatus, record],
  );

  const regenerate = useCallback(
    (target: RepurposeTarget) => {
      setReview(null);
      void runTarget(target, true);
    },
    [runTarget],
  );

  /** «Підкрутити» — back to the source text, the only text box in this flow. */
  const tweak = useCallback(() => setReview(null), []);

  const backToLink = useCallback(() => {
    setPhase('link');
    setReview(null);
    setError(null);
  }, []);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip.trim()) {
        setUrl(clip.trim());
        setError(null);
      }
    } catch {
      urlInput.current?.focus();
    }
  }, []);

  if (!open) return null;

  const anyLoading = ALL_TARGETS.some((t) => targetStatus[t] === 'loading');

  return (
    <BlurScrim zIndex={70} blurPx={14} tint="rgba(236,235,232,0.62)">
      <div
        data-testid="repurpose-overlay"
        data-phase={phase}
        role="dialog"
        aria-modal="true"
        aria-label="Переробити пост"
        className="relative flex h-full w-full flex-col"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 55%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.3) 45%, transparent 78%)',
          }}
        />

        {/* Top strip carries STATUS only — every control lives in the thumb zone.
            Both strips share the same centred max-width column so the flow reads
            as one measured block on a desktop instead of stretching a phone
            layout across 1400px. */}
        <div className="relative z-10 mx-auto flex h-7 w-full max-w-[600px] shrink-0 items-center px-5 pt-6">
          {phase === 'source' && source ? (
            <span
              data-testid="repurpose-source-chip"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: REPURPOSE_SOURCES[source.kind].soft,
                color: REPURPOSE_SOURCES[source.kind].color,
              }}
            >
              {REPURPOSE_SOURCES[source.kind].label}
              {source.author ? ` · ${source.author}` : ''}
            </span>
          ) : null}
        </div>

        <div
          className="relative z-10 mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col px-6 pb-[40px]"
          style={{ animation: 'braindump-rise 320ms ease-out both' }}
        >
          {/* Scrollable region — the source text can be long. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mt-auto pb-4">
              {phase === 'link' ? (
                <div data-testid="repurpose-link-step">
                  <h2 className="text-2xl font-bold leading-snug tracking-tight text-black">
                    Що переробляємо?
                  </h2>
                  <p className="mt-1.5 text-[13px] leading-snug text-zinc-500">
                    Встав посилання на свій рілс, пост у Threads або TikTok — зроблю з нього інший формат.
                  </p>

                  <div className="mt-4">
                    <div className="flex items-center gap-2">
                      <input
                        ref={urlInput}
                        type="url"
                        inputMode="url"
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          setError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && detected.ok && !extracting) void extract();
                        }}
                        placeholder="https://instagram.com/reel/…"
                        aria-label="Посилання на пост"
                        data-testid="repurpose-url"
                        className="min-w-0 flex-1 rounded-[14px] border border-[color:var(--border)] bg-white/90 px-3.5 py-3 text-[15px] text-zinc-900 outline-none transition-colors focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/20"
                      />
                      <button
                        type="button"
                        onClick={() => void pasteFromClipboard()}
                        data-testid="repurpose-paste"
                        aria-label="Вставити з буфера"
                        title="Вставити"
                        className="app-icon-btn shrink-0"
                      >
                        <LinkIcon className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>

                    {/* Detected live, from the URL alone — no round-trip. */}
                    <div className="mt-2 min-h-[22px]">
                      {detectedMeta ? (
                        <span
                          data-testid="repurpose-detected"
                          data-kind={detected.ok ? detected.kind : undefined}
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                          style={{ backgroundColor: detectedMeta.soft, color: detectedMeta.color }}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                          {detectedMeta.label}
                        </span>
                      ) : url.trim() ? (
                        <span className="text-[11.5px] text-zinc-400">Поки не впізнаю це посилання…</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div data-testid="repurpose-source-step">
                  <h2 className="text-[15px] font-semibold leading-snug tracking-tight text-zinc-500">
                    Ось що я почула в оригіналі
                  </h2>
                  <textarea
                    data-testid="repurpose-source-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={7}
                    aria-label="Текст оригіналу"
                    className="mt-2 w-full resize-none bg-transparent text-[17px] font-medium leading-snug tracking-tight text-black outline-none"
                  />
                  {source ? (
                    <a
                      href={source.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="repurpose-original-link"
                      className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
                      Відкрити оригінал
                    </a>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Pinned controls — never scroll away. */}
          <div className="shrink-0 pt-3">
            {error && (
              <div data-testid="repurpose-error" className="mb-3 text-sm font-medium text-zinc-500">
                {error}
                {retryable ? (
                  <button
                    type="button"
                    onClick={() => void extract()}
                    disabled={extracting}
                    className="ml-2 inline-flex rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-[color:var(--surface1)] disabled:opacity-60"
                  >
                    Спробувати ще раз
                  </button>
                ) : null}
              </div>
            )}

            {/* ONE exit, bottom-left, meaning "back one step" — identical to the
                braindump overlay so the two flows never disagree. */}
            <div className="mb-3 flex items-center">
              <button
                type="button"
                onClick={phase === 'source' ? backToLink : onClose}
                data-testid={phase === 'source' ? 'repurpose-back' : 'repurpose-close'}
                aria-label={phase === 'source' ? 'Інше посилання' : 'Закрити'}
                className="app-pill py-2 text-[12.5px]"
              >
                {phase === 'source' ? (
                  <>
                    <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Інше посилання
                  </>
                ) : (
                  <>
                    <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                    Закрити
                  </>
                )}
              </button>
            </div>

            {phase === 'link' && (
              <div>
                <button
                  type="button"
                  onClick={() => void extract()}
                  disabled={!detected.ok || extracting}
                  data-testid="repurpose-extract"
                  className="app-btn-primary w-full justify-center py-3 text-[15px] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {extracting ? 'Розбираю…' : 'Розібрати пост'}
                </button>
                {extracting && detectedMeta ? (
                  <p
                    data-testid="repurpose-progress"
                    className="mt-2.5 text-center text-[12px] leading-snug text-[color:var(--text-muted)]"
                  >
                    {detectedMeta.extractLabel} Це може зайняти до хвилини.
                  </p>
                ) : null}
              </div>
            )}

            {/* Result review comes FIRST: what just arrived is a proposal, and it
                gets decided before the next format is offered. */}
            {phase === 'source' && review !== null && (
              <div data-testid="repurpose-review">
                {review.kind === 'fanout' ? (
                  <FanOutReview
                    days={review.days}
                    reason={review.reason}
                    consecutive={review.consecutive}
                    onDone={() => setReview(null)}
                    onRegenerate={() => regenerate('stories')}
                    onTweak={tweak}
                    regenerating={targetStatus.stories === 'loading'}
                  />
                ) : review.kind === 'thread' ? (
                  <ThreadReview
                    title={review.title}
                    posts={review.posts}
                    sourceUrl={source?.sourceUrl ?? ''}
                    onKeep={() => setReview(null)}
                    onRegenerate={() => regenerate('threads')}
                    onTweak={tweak}
                    regenerating={targetStatus.threads === 'loading'}
                  />
                ) : (
                  <ResultReview
                    preview={review.preview}
                    onKeep={() => setReview(null)}
                    onRegenerate={() => regenerate(review.preview.type)}
                    onTweak={tweak}
                    regenerating={targetStatus[review.preview.type] === 'loading'}
                  />
                )}
              </div>
            )}

            {phase === 'source' && review === null && (
              <div>
                <p className="mb-3 text-sm font-medium text-zinc-500">У що переробимо?</p>
                <div className="grid grid-cols-3 gap-3">
                  {targets.map((target) => {
                    const meta = REPURPOSE_TARGETS[target];
                    const status = targetStatus[target];
                    const done = status === 'done';
                    const errored = status === 'error';
                    return (
                      <button
                        key={target}
                        type="button"
                        onClick={() => void runTarget(target, errored)}
                        data-testid={`repurpose-target-${target}`}
                        data-status={status}
                        disabled={status === 'loading'}
                        className="flex flex-col items-center gap-2 rounded-[16px] border-2 px-2 py-4 text-[13px] font-semibold transition-colors"
                        style={{
                          borderColor: done ? 'var(--success)' : errored ? ERROR_RED : meta.color,
                          color: done ? 'var(--success)' : errored ? ERROR_RED : meta.color,
                          backgroundColor: done
                            ? 'rgba(34,197,94,0.08)'
                            : errored
                              ? 'rgba(220,38,38,0.08)'
                              : meta.soft,
                        }}
                      >
                        {done ? (
                          <Check className="h-6 w-6" strokeWidth={2.4} />
                        ) : status === 'loading' ? (
                          <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : errored ? (
                          <RotateCw className="h-6 w-6" strokeWidth={2.4} />
                        ) : isContentTypeTarget(target) ? (
                          <ContentTypeIcon type={target} className="h-6 w-6" inheritColor />
                        ) : (
                          <MaterialIcon name="alternate_email" size={24} style={{ color: 'currentColor' }} />
                        )}
                        <span>{done ? 'Готово' : errored ? 'Ще раз?' : meta.label}</span>
                      </button>
                    );
                  })}
                </div>

                {anyLoading ? (
                  <p className="mt-3 text-center text-[12px] leading-snug text-[color:var(--text-muted)]">
                    Переробляю… це може зайняти до хвилини.
                  </p>
                ) : null}

                {/* Inline receipt — nothing is created silently. */}
                {receipt.length > 0 && (
                  <div className="mt-3 rounded-[14px] border border-[color:var(--border)] bg-white/80 p-1.5">
                    {receipt.map((entry) => {
                      const row = (
                        <>
                          {isContentTypeTarget(entry.target) ? (
                            <ContentTypeIcon type={entry.target} size={18} />
                          ) : (
                            <MaterialIcon
                              name="alternate_email"
                              size={18}
                              style={{ color: REPURPOSE_TARGETS.threads.color }}
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-[color:var(--foreground)]">
                              {entry.label}
                              {entry.setSize && entry.setSize > 1 ? (
                                <span className="ml-1.5 rounded-[5px] bg-[color:var(--surface2)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[color:var(--text-secondary)]">
                                  {entry.indexInSet}/{entry.setSize}
                                </span>
                              ) : null}
                            </span>
                            {entry.date ? (
                              <span className="mt-0.5 block text-[11px] text-[color:var(--text-muted)]">
                                {dayHeaderLabel(entry.date)}
                              </span>
                            ) : null}
                          </span>
                        </>
                      );
                      return isContentTypeTarget(entry.target) ? (
                        <a
                          key={`${entry.target}-${entry.id}`}
                          href={CONTENT_TYPES[entry.target].itemHref(entry.id)}
                          data-testid="repurpose-receipt-item"
                          className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors hover:bg-[color:var(--surface1)]"
                        >
                          {row}
                          <span className="text-[color:var(--text-muted)]">→</span>
                        </a>
                      ) : (
                        <div
                          key={`${entry.target}-${entry.id}`}
                          data-testid="repurpose-receipt-item"
                          className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2"
                        >
                          {row}
                          <span className="text-[11px] text-[color:var(--text-muted)]">в ідеях</span>
                        </div>
                      );
                    })}
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
