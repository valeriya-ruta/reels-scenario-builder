'use client';

import { createPortal } from 'react-dom';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Location, Project, Scene, Framing, ArmState, CameraMotion, TransitionAction } from '@/lib/domain';
import { formatLabel } from '@/lib/domain';
import { updateScene } from '@/app/actions';
import { isOptimisticSceneId } from '@/lib/sceneOptimistic';
import {
  estimateDialogueSeconds,
  getDurationTone,
  type DurationTone,
} from '@/lib/dialogueDuration';
import LocationPicker from './LocationPicker';

export type SceneCardVariant = 'default' | 'hook' | 'cta';

interface SceneCardProps {
  scene: Scene;
  /** Visual role from list order only (not persisted). */
  sceneVariant?: SceneCardVariant;
  project: Project;
  locations: Location[];
  onLocationsChange: Dispatch<SetStateAction<Location[]>>;
  onLocationDeleted: (locationId: string) => void;
  /** When a scene is still being created on the server, disable drag for all rows. */
  dragDisabled?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<Scene>) => void;
  onSplitLines: (start: number, end: number, selectedText: string) => void;
  onDelete: () => void;
  animateIn?: boolean;
  shouldGlow?: boolean;
}

function getTextAreaCaretPosition(
  textarea: HTMLTextAreaElement,
  index: number
): { left: number; top: number } {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.wordBreak = 'break-word';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';

  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.font = style.font;
  mirror.style.fontSize = style.fontSize;
  mirror.style.fontFamily = style.fontFamily;
  mirror.style.fontWeight = style.fontWeight;
  mirror.style.fontStyle = style.fontStyle;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.textTransform = style.textTransform;
  mirror.style.textIndent = style.textIndent;
  mirror.style.textAlign = style.textAlign;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.boxSizing = style.boxSizing;

  const textBefore = textarea.value.slice(0, index);
  mirror.textContent = textBefore;

  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);

  return {
    left: markerRect.left - mirrorRect.left,
    top: markerRect.top - mirrorRect.top,
  };
}

export default function SceneCard({
  scene,
  sceneVariant = 'default',
  project,
  locations,
  onLocationsChange,
  onLocationDeleted,
  dragDisabled = false,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onSplitLines,
  onDelete,
  animateIn = false,
  shouldGlow = false,
}: SceneCardProps) {
  const onDeleteRef = useRef(onDelete);
  useEffect(() => {
    onDeleteRef.current = onDelete;
  }, [onDelete]);

  const sortableDisabled =
    dragDisabled || isOptimisticSceneId(scene.id);

  const [isExiting, setIsExiting] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: scene.id,
    disabled: sortableDisabled || isExiting,
    transition: {
      duration: 140,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    },
  });

  const EXIT_MS = 180;

  useEffect(() => {
    if (!isExiting) return;
    const t = window.setTimeout(() => {
      void onDeleteRef.current();
    }, EXIT_MS);
    return () => window.clearTimeout(t);
  }, [isExiting]);

  const style = {
    transform: isExiting
      ? 'translateY(-8px)'
      : CSS.Transform.toString(transform),
    transition: isExiting
      ? `opacity ${EXIT_MS}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${EXIT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
      : transition,
    opacity: isExiting ? 0 : isDragging ? 0.5 : 1,
  };

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(scene.name || '');
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [splitPopup, setSplitPopup] = useState<{
    top: number;
    left: number;
    start: number;
    end: number;
    selectedText: string;
  } | null>(null);
  const [isContentMounted, setIsContentMounted] = useState(isExpanded);
  const [isAnimatingOpen, setIsAnimatingOpen] = useState(isExpanded);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedPanelId = useId();

  useEffect(() => {
    setNameValue(scene.name || '');
  }, [scene.id, scene.name]);

  useEffect(() => {
    if (!isExpanded) setAdvancedOpen(false);
  }, [isExpanded]);

  useEffect(() => {
    setSplitPopup(null);
  }, [scene.id, isExpanded]);

  const [enterOn, setEnterOn] = useState(!animateIn);
  useEffect(() => {
    if (!animateIn) {
      setEnterOn(true);
      return;
    }

    setEnterOn(false);
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEnterOn(true));
    });
    return () => window.cancelAnimationFrame(id);
  }, [animateIn]);

  const enterStyle = {
    opacity: enterOn ? 1 : 0,
    transform: enterOn ? 'translateY(0px)' : 'translateY(-18px)',
    transition:
      'opacity 720ms cubic-bezier(0.22, 1, 0.36, 1), transform 720ms cubic-bezier(0.22, 1, 0.36, 1)',
  };

  useEffect(() => {
    if (isExpanded) {
      // Mount first so height is measurable, then animate on the next frame.
      setIsContentMounted(true);
      requestAnimationFrame(() => setIsAnimatingOpen(true));
      return;
    }

    // Animate closed, then unmount after the CSS transition.
    setIsAnimatingOpen(false);
    const timeout = window.setTimeout(() => setIsContentMounted(false), 320);
    return () => window.clearTimeout(timeout);
  }, [isExpanded]);

  const sceneIndexLabel = scene.order_index + 1;
  const defaultName = `Сцена ${sceneIndexLabel}`;

  const variantSurface =
    sceneVariant === 'hook'
      ? 'border-[color:var(--accent)]/25 bg-[color:var(--accent-soft)]/60'
      : sceneVariant === 'cta'
        ? 'border-emerald-200/80 bg-emerald-50/50'
        : 'border-zinc-200 bg-white';

  const persist = (updates: Partial<Scene>) => {
    if (!isOptimisticSceneId(scene.id)) {
      updateScene(scene.id, updates);
    }
  };

  const handleNameSave = () => {
    setIsEditingName(false);
    const trimmed = nameValue.trim();
    onUpdate({ name: trimmed || null });
    persist({ name: trimmed || null });
  };

  const dialoguePreview = scene.lines?.trim()
    ? scene.lines
    : 'Немає діалогу';

  const hasDialogue = Boolean(scene.lines?.trim());

  const locationSummaryLabel =
    locations.find((l) => l.id === scene.location_id)?.name ?? 'Локація не обрана';
  const advancedSummaryLine = [
    formatLabel(scene.framing),
    formatLabel(scene.arm_state),
    formatLabel(scene.camera_motion || 'static'),
    locationSummaryLabel,
    formatLabel(scene.scene_transition_action || 'no_action'),
  ].join(' · ');
  /** Legacy: AI used to store "~3с" in editor_note; ignore for «Примітки» summary. */
  const editorNoteIsLegacyAiDurationHint =
    scene.editor_note?.trim()?.startsWith('~') ?? false;
  const hasCrewNotes = Boolean(
    scene.actor_note?.trim() ||
      (scene.editor_note?.trim() && !editorNoteIsLegacyAiDurationHint)
  );
  const dialogueSeconds = estimateDialogueSeconds(scene.lines);

  const handleCardClick = (e: React.MouseEvent) => {
    if (isExiting) return;
    // Don't toggle if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('select') ||
      target.closest('[data-drag-handle]')
    ) {
      return;
    }
    onToggleExpand();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExiting) return;
    setIsExiting(true);
  };

  const updateSplitPopup = () => {
    const ta = textAreaRef.current;
    if (!ta) return;

    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (start === end) {
      setSplitPopup(null);
      return;
    }

    const selectedText = ta.value.slice(start, end);
    if (!selectedText.trim()) {
      setSplitPopup(null);
      return;
    }

    const rect = ta.getBoundingClientRect();
    const caret = getTextAreaCaretPosition(ta, start);
    setSplitPopup({
      top: Math.max(6, rect.top + caret.top - ta.scrollTop - 38),
      left: rect.left + caret.left - ta.scrollLeft,
      start,
      end,
      selectedText,
    });
  };

  const hideSplitPopup = () => {
    window.setTimeout(() => setSplitPopup(null), 80);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-lg border p-5 card-shadow transition-shadow duration-300 ease-in-out ${variantSurface} ${
        isExiting ? 'pointer-events-none' : 'cursor-pointer hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)]'
      } ${shouldGlow ? 'reels-planner-scene-glow' : ''}`}
      onClick={handleCardClick}
    >
      {sceneVariant === 'hook' && (
        <span className="absolute left-4 top-3 rounded bg-[color:var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--accent)]">
          ХУК
        </span>
      )}
      {sceneVariant === 'cta' && (
        <span className="absolute left-4 top-3 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
          CTA
        </span>
      )}
      <div style={enterStyle} className={sceneVariant !== 'default' ? 'pt-5' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <div
              {...attributes}
              {...listeners}
              data-drag-handle
              className={
                sortableDisabled
                  ? 'mt-0.5 cursor-default text-zinc-300'
                  : 'mt-0.5 cursor-grab text-zinc-500 hover:text-zinc-600'
              }
              onClick={(e) => e.stopPropagation()}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Сцена {sceneIndexLabel}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {isEditingName ? (
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onBlur={handleNameSave}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleNameSave();
                      if (e.key === 'Escape') {
                        setNameValue(scene.name || '');
                        setIsEditingName(false);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={defaultName}
                    className="w-40 border-b border-zinc-400 bg-transparent text-sm font-medium text-zinc-800 placeholder-zinc-400"
                  />
                ) : (
                  <span
                    className="cursor-text text-sm font-medium text-zinc-800 decoration-dashed underline-offset-2 hover:text-zinc-950 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingName(true);
                    }}
                    title="Натисніть, щоб перейменувати"
                  >
                    {scene.name || defaultName}
                  </span>
                )}
              </div>
              {!isExpanded && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-normal text-zinc-700">
                  {dialoguePreview}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start pt-0.5">
            {!isExpanded && hasDialogue && (
              <DialogueDurationBadge seconds={dialogueSeconds} />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="cursor-pointer text-zinc-500 hover:text-zinc-700 transition-transform duration-300"
            >
              <svg
                className="h-5 w-5"
                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              className="cursor-pointer text-zinc-400 hover:text-red-500 transition-colors"
              title="Видалити сцену"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div
        className={[
          'overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-in-out',
          isAnimatingOpen ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0',
        ].join(' ')}
      >
        {isContentMounted ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Текст
              </label>
              <div className="relative">
                <textarea
                  ref={textAreaRef}
                  value={scene.lines || ''}
                  onChange={(e) => {
                    onUpdate({ lines: e.target.value });
                    persist({ lines: e.target.value });
                    setSplitPopup(null);
                  }}
                  onSelect={updateSplitPopup}
                  onKeyUp={updateSplitPopup}
                  onMouseUp={updateSplitPopup}
                  onScroll={updateSplitPopup}
                  onBlur={hideSplitPopup}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded border border-zinc-300 bg-white px-3 py-2 pr-16 pb-8 text-sm leading-normal text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
                  rows={3}
                  placeholder="Діалог або голос за кадром..."
                />
                {splitPopup && (
                  <div
                    className="fixed z-[220]"
                    style={{ top: splitPopup.top, left: splitPopup.left }}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSplitLines(
                          splitPopup.start,
                          splitPopup.end,
                          splitPopup.selectedText
                        );
                        setSplitPopup(null);
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-lg transition hover:border-zinc-400 hover:bg-zinc-50"
                    >
                      <img
                        src="/icons/subdirectory_arrow_right.svg"
                        alt=""
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0"
                      />
                      <span>нова сцена</span>
                    </button>
                  </div>
                )}
                {hasDialogue && (
                  <div className="absolute bottom-2 right-2 z-10">
                    <DialogueDurationBadge seconds={dialogueSeconds} />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50/80">
              <button
                type="button"
                id={`${advancedPanelId}-trigger`}
                aria-expanded={advancedOpen}
                aria-controls={advancedPanelId}
                onClick={(e) => {
                  e.stopPropagation();
                  setAdvancedOpen((o) => !o);
                }}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-100/90"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-zinc-800">
                    Додаткові налаштування
                  </span>
                  {!advancedOpen && (
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-600">
                      {advancedSummaryLine}
                      {hasCrewNotes ? ' · Примітки' : ''}
                    </p>
                  )}
                </div>
                <svg
                  className={`mt-0.5 h-5 w-5 shrink-0 text-zinc-500 transition-transform duration-200 ${
                    advancedOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              <div
                id={advancedPanelId}
                role="region"
                aria-labelledby={`${advancedPanelId}-trigger`}
                className={[
                  'overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out',
                  advancedOpen
                    ? 'max-h-[4000px] opacity-100'
                    : 'pointer-events-none max-h-0 opacity-0',
                ].join(' ')}
              >
                <div className="space-y-4 border-t border-zinc-200 px-3 pb-4 pt-3">
                  <div className="grid grid-cols-2 gap-4">
                    <ChipSelector
                      label="Кадрування"
                      value={scene.framing}
                      options={[
                        'extreme_close_up',
                        'close_up',
                        'above_waist',
                        'full_body',
                        'overhead',
                        'low_angle',
                      ]}
                      onChange={(value) => {
                        onUpdate({ framing: value as Framing });
                        persist({ framing: value as Framing });
                      }}
                    />

                    <ChipSelector
                      label="Положення рук"
                      value={scene.arm_state}
                      options={[
                        'arms_at_sides',
                        'one_arm_raised',
                        'holding_object',
                        'pointing',
                      ]}
                      onChange={(value) => {
                        onUpdate({ arm_state: value as ArmState });
                        persist({ arm_state: value as ArmState });
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <ChipSelector
                      label="Рух камери"
                      value={scene.camera_motion || 'static'}
                      options={[
                        'static',
                        'push_in',
                        'pull_out',
                        'pan_left',
                        'pan_right',
                        'tilt_up',
                        'tilt_down',
                        'handheld',
                      ]}
                      onChange={(value) => {
                        onUpdate({ camera_motion: value as CameraMotion });
                        persist({
                          camera_motion: value as CameraMotion,
                        });
                      }}
                    />
                    <LocationPicker
                      locations={locations}
                      locationId={scene.location_id ?? null}
                      disabled={isOptimisticSceneId(scene.id)}
                      onSceneLocationChange={(locationId) => {
                        onUpdate({ location_id: locationId });
                        persist({ location_id: locationId });
                      }}
                      onLocationsChange={onLocationsChange}
                      onLocationDeleted={onLocationDeleted}
                    />
                  </div>

                  <div>
                    <ChipSelector
                      label="Дія для переходу"
                      value={scene.scene_transition_action || 'no_action'}
                      options={['no_action', 'turn_matchcut', 'through_object']}
                      onChange={(value) => {
                        onUpdate({
                          scene_transition_action: value as TransitionAction,
                        });
                        persist({
                          scene_transition_action: value as TransitionAction,
                        });
                      }}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Примітка для актора
                    </label>
                    <textarea
                      value={scene.actor_note || ''}
                      onChange={(e) => {
                        onUpdate({ actor_note: e.target.value });
                        persist({ actor_note: e.target.value });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm leading-normal text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
                      rows={2}
                      placeholder="Примітка для актора..."
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Примітка для редактора
                    </label>
                    <textarea
                      value={scene.editor_note || ''}
                      onChange={(e) => {
                        onUpdate({ editor_note: e.target.value });
                        persist({
                          editor_note: e.target.value,
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm leading-normal text-zinc-900 placeholder-zinc-500 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]/30"
                      rows={2}
                      placeholder="Примітка для редактора..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DurationToneIcon({ tone }: { tone: DurationTone }) {
  const common = 'h-3 w-3 shrink-0';
  if (tone === 'green') {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (tone === 'yellow') {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
        />
      </svg>
    );
  }
  return (
    <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

const DURATION_TOOLTIP_TITLE = 'Що це таке?';
const DURATION_TOOLTIP_BODY = [
  'Загальна рекомендація при створення захоплюючих рілсів - це змінювати кадр кожні 3-5 секунд, щоб утримувати увагу.',
  "Завдяки цій інформації ти можеш побачити, скільки секунд займає твій кадр (розрахунок 130 слів/хв, до речі), і якщо кількість секунд завелика - це твій сигнал, що краще розбити цю фразу на декілька різних кадрів",
];

function DialogueDurationBadge({ seconds }: { seconds: number }) {
  const tooltipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const tone = getDurationTone(seconds);
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : tone === 'yellow'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-red-200 bg-red-50 text-red-800';

  const labelHint =
    tone === 'green'
      ? 'коротко'
      : tone === 'yellow'
        ? 'помірна довжина'
        : 'довго для короткого рілсу';

  const updatePosition = () => {
    const el = btnRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top, right: window.innerWidth - r.right });
  };

  const cancelClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 180);
  };

  const openTooltip = () => {
    cancelClose();
    setOpen(true);
    requestAnimationFrame(() => updatePosition());
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const bottomFromViewport =
    typeof window !== 'undefined' ? window.innerHeight - pos.top + 8 : 0;

  const tooltipContent =
    open && typeof document !== 'undefined' ? (
      <div
        id={tooltipId}
        role="tooltip"
        className="fixed z-[200] max-h-[min(50vh,20rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-xl"
        style={{
          right: pos.right,
          bottom: bottomFromViewport,
        }}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <p className="text-sm font-semibold text-zinc-900">{DURATION_TOOLTIP_TITLE}</p>
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-600">
          {DURATION_TOOLTIP_BODY.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        className={[
          'inline-flex shrink-0 cursor-help items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums',
          toneClass,
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]',
        ].join(' ')}
        aria-label={`Орієнтовна тривалість ${seconds} секунд, ${labelHint}. Наведи курсор для пояснення.`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={openTooltip}
        onMouseLeave={scheduleClose}
        onFocus={openTooltip}
        onBlur={scheduleClose}
      >
        <DurationToneIcon tone={tone} />
        {seconds}с
      </button>
      {tooltipContent && createPortal(tooltipContent, document.body)}
    </>
  );
}

function ChipSelector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-zinc-600">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(option);
            }}
            className={[
              'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors',
              value === option
                ? 'bg-[color:var(--accent)] text-white'
                : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300',
            ].join(' ')}
          >
            {formatLabel(option)}
          </button>
        ))}
      </div>
    </div>
  );
}
