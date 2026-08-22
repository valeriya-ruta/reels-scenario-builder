'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Loader2, Maximize2, Minimize2, Plus, X } from 'lucide-react';
import { saveInlineReel, saveInlineStory } from '@/app/plan/inline-actions';
import { genClientId } from '@/lib/storytelling/optimistic';
import { BLOCK_COLORS, BLOCK_KINDS, BLOCK_LABELS, type BlockKind } from '@/lib/reels/blocks';
import { ENGAGEMENT_OPTIONS, VISUAL_OPTIONS, type EngagementType, type VisualType } from '@/lib/domain';
import { dayHeaderLabel } from '@/lib/content/calendar';
import { TYPE_LABELS } from '@/lib/content/statusSystem';
import {
  diffBlocks,
  diffStories,
  docIsDirty,
  emptyBlock,
  emptyStory,
  type EditableBlock,
  type EditableDoc,
  type EditableStory,
} from '@/lib/plan/editableDoc';

/**
 * The piece beside the calendar, editable — the panel you fix a reel IN.
 *
 * The complaint this answers: seeing a story on Friday, wanting to change one
 * line, and being thrown out to the builder — where the right column then had
 * to be found. The piece is already open and already on screen; the edit
 * belongs here.
 *
 * It is a FORM, not the builder. The builder autosaves every keystroke because
 * you live in it; this you visit, change three things, and commit — so there is
 * a Save, a Cancel that really discards, and a draft in between that the
 * database never sees. What it cannot express (a cutaway's individual shots,
 * a carousel's design, the days of a saga) it says so and points at the full
 * editor rather than pretending.
 */

type Props = {
  doc: EditableDoc | null;
  loading: boolean;
  failed: boolean;
  /** «Сторітел» / «Рілс» + the day, for the header. */
  typeLabel: keyof typeof TYPE_LABELS;
  scheduledDate: string | null;
  expanded?: boolean;
  surface?: string;
  onToggleExpand?: () => void;
  onOpenFullEditor: () => void;
  onCancel: () => void;
  /** Saved — the parent re-reads the piece and drops back to reading it. */
  onSaved: () => void;
};

export default function PieceInlineEditor({
  doc,
  loading,
  failed,
  typeLabel,
  scheduledDate,
  expanded,
  surface = 'var(--background)',
  onToggleExpand,
  onOpenFullEditor,
  onCancel,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<EditableDoc | null>(doc);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The draft is seeded from the loaded document and re-seeded when a DIFFERENT
  // piece is opened. Keyed on the id, not the object, so a re-render of the
  // same piece never wipes what has been typed into it.
  useEffect(() => {
    setDraft(doc);
    setError(null);
  }, [doc]);

  const dirty = useMemo(() => (doc && draft ? docIsDirty(doc, draft) : false), [doc, draft]);

  // Closing the tab mid-edit is how the work would get lost, and the panel has
  // no autosave to fall back on — so the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const cancel = useCallback(() => {
    if (dirty && !window.confirm('Скасувати зміни? Незбережене зникне.')) return;
    onCancel();
  }, [dirty, onCancel]);

  const save = useCallback(async () => {
    if (!doc || !draft || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result =
        draft.kind === 'story' && doc.kind === 'story'
          ? await saveInlineStory(
              draft.id,
              draft.name,
              draft.columnId,
              diffStories(doc.stories, draft.stories),
            )
          : draft.kind === 'reel' && doc.kind === 'reel'
            ? await saveInlineReel(
                draft.id,
                draft.name,
                draft.overview,
                diffBlocks(doc.blocks, draft.blocks),
              )
            : ({ ok: false, error: 'MISMATCH' } as const);

      if (!result.ok) {
        setError('Не вдалося зберегти. Спробуй ще раз.');
        return;
      }
      onSaved();
    } catch {
      setError('Не вдалося зберегти. Спробуй ще раз.');
    } finally {
      setSaving(false);
    }
  }, [doc, draft, saving, onSaved]);

  if (failed) {
    return (
      <p className="px-1 py-8 text-center text-[13px] text-red-600">
        Не вдалося відкрити цей контент.
      </p>
    );
  }
  if (loading || !draft) {
    return (
      <p className="px-1 py-8 text-center text-[13px] text-[color:var(--text-muted)]">Відкриваю…</p>
    );
  }

  const count =
    draft.kind === 'story'
      ? `${draft.stories.length} сторіс`
      : `${draft.blocks.length} ${draft.blocks.length === 1 ? 'блок' : 'блоків'}`;

  return (
    <div data-testid="piece-inline-editor">
      {/* Same sticky header as the reading panel, so switching between reading
          and editing does not move the title or the buttons out from under the
          cursor. The accent border is the whole "you are editing now" signal. */}
      <div
        data-testid="inline-editor-head"
        className="sticky top-0 z-10 flex items-start gap-3 pb-2.5 before:absolute before:-inset-x-6 before:-top-6 before:bottom-0 before:-z-10 before:bg-[color:var(--head-bg)] before:content-['']"
        style={{ ['--head-bg' as string]: surface }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">
            Редагую · {TYPE_LABELS[typeLabel]}
            {scheduledDate ? ` · ${dayHeaderLabel(scheduledDate)}` : ''}
          </p>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Назва"
            data-testid="inline-name"
            className="mt-1 w-full rounded-[8px] border border-transparent bg-transparent text-[20px] font-bold leading-tight tracking-tight text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] hover:border-[color:var(--border)] focus:border-[color:var(--border-strong)]"
          />
          <p className="mt-1.5 text-[12px] font-medium text-[color:var(--text-muted)]">{count}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenFullEditor}
            data-testid="inline-open-full"
            aria-label="Відкрити повний редактор"
            title="Відкрити повний редактор"
            className="app-icon-btn"
          >
            <ExternalLink className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={expanded ? 'Згорнути' : 'На весь екран'}
              title={expanded ? 'Згорнути' : 'На весь екран'}
              className="app-icon-btn"
            >
              {expanded ? (
                <Minimize2 className="h-4.5 w-4.5" strokeWidth={2} />
              ) : (
                <Maximize2 className="h-4.5 w-4.5" strokeWidth={2} />
              )}
            </button>
          )}
        </div>
      </div>

      {draft.kind === 'story' ? (
        <StoryDraft draft={draft} onChange={setDraft} />
      ) : (
        <ReelDraft draft={draft} onChange={setDraft} />
      )}

      {error && (
        <p role="status" data-testid="inline-error" className="mt-3 text-[13px] font-medium text-red-600">
          {error}
        </p>
      )}

      {/* The two ways out, pinned to the bottom of the panel — a long reel must
          not put Save below three screens of scrolling. */}
      <div
        className="sticky bottom-0 z-10 mt-4 flex items-center gap-2 pb-1 pt-3 before:absolute before:-inset-x-6 before:-bottom-1 before:top-0 before:-z-10 before:bg-[color:var(--head-bg)] before:content-['']"
        style={{ ['--head-bg' as string]: surface }}
      >
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          data-testid="inline-save"
          className="app-btn-primary flex-1 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} /> : null}
          {saving ? 'Зберігаю…' : dirty ? 'Зберегти' : 'Збережено'}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          data-testid="inline-cancel"
          className="rounded-[12px] border border-[color:var(--border)] px-4 py-2.5 text-[13.5px] font-semibold text-zinc-600 transition-colors hover:bg-[color:var(--surface1)]"
        >
          Скасувати
        </button>
      </div>
    </div>
  );
}

// ── storytelling ────────────────────────────────────────────────────────────

function StoryDraft({
  draft,
  onChange,
}: {
  draft: Extract<EditableDoc, { kind: 'story' }>;
  onChange: (next: EditableDoc) => void;
}) {
  const setStories = (stories: EditableStory[]) => onChange({ ...draft, stories });

  const patch = (id: string, updates: Partial<EditableStory>) =>
    setStories(draft.stories.map((s) => (s.id === id ? { ...s, ...updates } : s)));

  const move = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= draft.stories.length) return;
    const next = [...draft.stories];
    [next[index], next[to]] = [next[to], next[index]];
    setStories(next);
  };

  return (
    <div className="mt-4 space-y-3">
      {draft.stories.map((story, index) => (
        <div
          key={story.id}
          data-testid="inline-story"
          className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface1)]/60 p-3.5"
        >
          <RowTools
            label={`Сторіс ${index + 1}`}
            index={index}
            total={draft.stories.length}
            onMove={(d) => move(index, d)}
            onDelete={() => setStories(draft.stories.filter((s) => s.id !== story.id))}
          />

          <textarea
            value={story.text}
            onChange={(e) => patch(story.id, { text: e.target.value })}
            rows={4}
            placeholder="Про що ця сторіс? Пиши, як говориш…"
            data-testid="inline-story-text"
            className="mt-2 w-full resize-y rounded-[10px] border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 text-[15px] leading-[1.6] text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--border-strong)]"
          />

          <ChipRow
            label="Візуал"
            options={VISUAL_OPTIONS}
            selected={story.visual}
            onToggle={(value) => patch(story.id, { visual: value as VisualType | null })}
          />
          <ChipRow
            label="Інтерактив"
            options={ENGAGEMENT_OPTIONS}
            selected={story.engagement}
            onToggle={(value) => patch(story.id, { engagement: value as EngagementType | null })}
          />
        </div>
      ))}

      {draft.stories.length === 0 && <EmptyHint text="Тут ще порожньо — додай першу сторіс." />}

      <AddButton
        label="Додати сторіс"
        testId="inline-add-story"
        onClick={() => setStories([...draft.stories, emptyStory(genClientId())])}
      />
    </div>
  );
}

// ── reel ────────────────────────────────────────────────────────────────────

function ReelDraft({
  draft,
  onChange,
}: {
  draft: Extract<EditableDoc, { kind: 'reel' }>;
  onChange: (next: EditableDoc) => void;
}) {
  const setBlocks = (blocks: EditableBlock[]) => onChange({ ...draft, blocks });

  const patch = (id: string, updates: Partial<EditableBlock>) =>
    setBlocks(draft.blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)));

  const move = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= draft.blocks.length) return;
    const next = [...draft.blocks];
    [next[index], next[to]] = [next[to], next[index]];
    setBlocks(next);
  };

  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
          Про що цей рілс
        </label>
        <textarea
          value={draft.overview}
          onChange={(e) => onChange({ ...draft, overview: e.target.value })}
          rows={2}
          maxLength={2000}
          data-testid="inline-overview"
          placeholder="Загальна ідея — що це за рілс, який настрій."
          className="w-full resize-y rounded-[10px] border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5 text-[14px] leading-relaxed text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--border-strong)]"
        />
      </div>

      {draft.blocks.map((block, index) => (
        <div
          key={block.id}
          data-testid="inline-block"
          className="rounded-[16px] border-l-[3px] border border-[color:var(--border)] bg-[color:var(--surface1)]/60 p-3.5"
          style={{ borderLeftColor: BLOCK_COLORS[block.kind] }}
        >
          <RowTools
            label={`${index + 1}`}
            index={index}
            total={draft.blocks.length}
            onMove={(d) => move(index, d)}
            onDelete={() => setBlocks(draft.blocks.filter((b) => b.id !== block.id))}
            trailing={
              <select
                value={block.kind}
                onChange={(e) => patch(block.id, { kind: e.target.value as BlockKind })}
                data-testid="inline-block-kind"
                aria-label="Тип блоку"
                className="cursor-pointer rounded-[8px] border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1 text-[12px] font-semibold text-[color:var(--foreground)] outline-none"
              >
                {BLOCK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {BLOCK_LABELS[k]}
                  </option>
                ))}
              </select>
            }
          />

          {block.kind === 'dialogue' && (
            <Field
              label="Хто говорить"
              value={block.speaker}
              onChange={(v) => patch(block.id, { speaker: v })}
              placeholder="Ім’я"
            />
          )}

          <Field
            label="Що кажу"
            value={block.spoken}
            onChange={(v) => patch(block.id, { spoken: v })}
            placeholder="Текст, який звучить"
            testId="inline-block-spoken"
            multiline
          />
          <Field
            label="Текст на екрані"
            value={block.screenText}
            onChange={(v) => patch(block.id, { screenText: v })}
            placeholder="Напис поверх кадру"
          />
          <Field
            label="Як знімати"
            value={block.recordNote}
            onChange={(v) => patch(block.id, { recordNote: v })}
            placeholder="Кадр, план, що робити в кадрі"
          />
          <Field
            label="Що за кадр"
            value={block.assetNote}
            onChange={(v) => patch(block.id, { assetNote: v })}
            placeholder="Відео / фото, яке треба зняти чи знайти"
          />
          <Field
            label="Як монтувати"
            value={block.editNote}
            onChange={(v) => patch(block.id, { editNote: v })}
            placeholder="Що робить монтажер"
          />

          {/* A cutaway's individual shots are a list-inside-a-list. Editing that
              here would be a worse version of the builder, so it is left alone
              and said out loud rather than silently hidden. */}
          {block.clipCount > 0 && (
            <p
              data-testid="inline-clip-note"
              className="mt-2 rounded-[10px] border border-dashed border-[color:var(--border)] px-3 py-2 text-[12px] text-[color:var(--text-muted)]"
            >
              {block.clipCount} кадрів усередині — їх видно й редагується в повному редакторі.
            </p>
          )}
        </div>
      ))}

      {draft.blocks.length === 0 && (
        <EmptyHint text="Порожній рілс — додай перший блок, або збери його в повному редакторі з готової форми." />
      )}

      <AddButton
        label="Додати блок"
        testId="inline-add-block"
        onClick={() => setBlocks([...draft.blocks, emptyBlock(genClientId())])}
      />
    </div>
  );
}

// ── small shared parts ──────────────────────────────────────────────────────

function RowTools({
  label,
  index,
  total,
  onMove,
  onDelete,
  trailing,
}: {
  label: string;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wide tabular-nums text-[color:var(--text-muted)]">
        {label}
      </span>
      {trailing}
      <span className="flex-1" />
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={index === 0}
        aria-label="Вище"
        className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-800 disabled:opacity-30"
      >
        <ChevronUp className="h-4 w-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === total - 1}
        aria-label="Нижче"
        className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-800 disabled:opacity-30"
      >
        <ChevronDown className="h-4 w-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Видалити"
        data-testid="inline-delete-row"
        className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white hover:text-red-500"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  testId?: string;
}) {
  const className =
    'w-full rounded-[10px] border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-[14px] leading-relaxed text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--border-strong)]';
  return (
    <label className="mt-2.5 block">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          data-testid={testId}
          className={`${className} resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testId}
          className={className}
        />
      )}
    </label>
  );
}

function ChipRow({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string | null;
  onToggle: (value: string | null) => void;
}) {
  return (
    <div className="mt-2.5">
      <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-[color:var(--text-muted)]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(active ? null : option)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                active
                  ? 'bg-[color:var(--accent)] text-white'
                  : 'bg-[color:var(--surface2)] text-zinc-600 hover:bg-[color:var(--surface1)]'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p className="rounded-[14px] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-[13px] text-[color:var(--text-muted)]">
      {text}
    </p>
  );
}

function AddButton({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-[color:var(--border)] px-4 py-2.5 text-[13.5px] font-semibold text-zinc-600 transition-colors hover:border-[color:var(--border-strong)] hover:bg-[color:var(--surface1)]"
    >
      <Plus className="h-4 w-4" strokeWidth={2.4} />
      {label}
    </button>
  );
}
