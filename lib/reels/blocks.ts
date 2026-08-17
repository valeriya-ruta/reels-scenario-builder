/**
 * A reel as BLOCKS — the shape, and the two questions every block answers.
 *
 * The old model was one rigid scene per beat: framing, pose, arm_state, facing.
 * It could only describe one person standing in front of a camera, which is why
 * a dialogue had nowhere to name the speaker, a trend had nowhere to put the
 * text on screen, and "поки кажеш оце — вискакує ось таке" could not be written
 * down at all.
 *
 * A block instead answers, always:
 *     як знімати   — what a camera has to capture (or nothing, for edit-only)
 *     як монтувати — what the editor does with it
 *
 * Kept import-free of React/server code: the builder, the client's share page
 * and the specs all read these same rules, so the shot list the client is handed
 * cannot drift from the one the builder shows.
 */

export type BlockKind = 'talk' | 'dialogue' | 'text' | 'broll' | 'sound';

/** What someone has to DO to get an asset — the question a shot list answers. */
export type AssetKind = 'film' | 'find' | 'screenshot' | 'photo';

export type OverlayKind = 'image' | 'video' | 'text' | 'sound' | 'note';

/**
 * An "add-on" hanging off a phrase in the spoken text — «поки кажеш оце,
 * вискакує ось таке». Written the way a comment is written in a Google Doc:
 * select the words, attach the thing.
 *
 * Anchored by BOTH offset and the phrase itself, on purpose. The offset is
 * exact while the script is untouched; the phrase is what finds it again after
 * the script is edited above it. When neither matches the overlay is not
 * deleted — it detaches and still shows, because losing an editing instruction
 * silently is worse than showing one whose anchor drifted.
 */
export type Overlay = {
  id: string;
  /** The selected phrase this hangs off. Empty = applies to the whole block. */
  anchorText: string;
  /** Character offset of the selection when it was made. */
  anchorStart: number;
  kind: OverlayKind;
  note: string;
  url?: string;
};

export const OVERLAY_KINDS: readonly OverlayKind[] = ['image', 'video', 'text', 'sound', 'note'];

export const OVERLAY_LABELS: Record<OverlayKind, string> = {
  image: 'Фото',
  video: 'Відео',
  text: 'Напис',
  sound: 'Звук',
  note: 'Нотатка',
};

/** Where an overlay actually sits in the current text. */
export type ResolvedOverlay = Overlay & {
  /** Offset in the CURRENT text, or null when the phrase is gone. */
  start: number | null;
  end: number | null;
  /** True when the anchor no longer matches — shown, but not highlighted. */
  detached: boolean;
};

/**
 * Re-find each overlay in the text as it now reads.
 *
 * Exact offset first (the common case: nothing above it changed), then the
 * nearest occurrence of the phrase to where it used to be — which is what keeps
 * the right one anchored when a word repeats in the same block.
 */
export function resolveOverlays(text: string | null, overlays: ReadonlyArray<Overlay>): ResolvedOverlay[] {
  const body = text ?? '';
  return overlays.map((o) => {
    const phrase = (o.anchorText ?? '').trim();
    if (!phrase) return { ...o, start: null, end: null, detached: false };

    if (body.slice(o.anchorStart, o.anchorStart + phrase.length) === phrase) {
      return { ...o, start: o.anchorStart, end: o.anchorStart + phrase.length, detached: false };
    }

    let best = -1;
    let bestDistance = Infinity;
    for (let i = body.indexOf(phrase); i !== -1; i = body.indexOf(phrase, i + 1)) {
      const d = Math.abs(i - o.anchorStart);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    if (best === -1) return { ...o, start: null, end: null, detached: true };
    return { ...o, start: best, end: best + phrase.length, detached: false };
  });
}

/**
 * Split a block's text into runs, so the editor can underline the anchored
 * phrases without a rich-text engine. Overlapping anchors keep the first one —
 * two add-ons on the same words is a labelling problem, not a rendering one.
 */
export type TextRun = { text: string; overlayIds: string[] };

export function textRuns(text: string | null, overlays: ReadonlyArray<Overlay>): TextRun[] {
  const body = text ?? '';
  if (!body) return [];
  const marks = resolveOverlays(body, overlays)
    .filter((o): o is ResolvedOverlay & { start: number; end: number } => o.start !== null && o.end !== null)
    .sort((a, b) => a.start - b.start);

  const runs: TextRun[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue; // overlaps an earlier anchor
    if (m.start > cursor) runs.push({ text: body.slice(cursor, m.start), overlayIds: [] });
    runs.push({ text: body.slice(m.start, m.end), overlayIds: [m.id] });
    cursor = m.end;
  }
  if (cursor < body.length) runs.push({ text: body.slice(cursor), overlayIds: [] });
  return runs;
}

/**
 * Where a block's sound comes from — separate from what is on screen.
 *
 * This is the axis that makes «b-roll із тим самим звуком зверху» sayable. The
 * picture cutting away and the voice continuing are independent choices, and an
 * editor cannot infer which was meant: muting a cutaway and running the previous
 * take under it are different edits.
 */
export type AudioSource = 'sync' | 'voiceover' | 'trend' | 'mute';

export const AUDIO_SOURCES: readonly AudioSource[] = ['sync', 'voiceover', 'trend', 'mute'];

export const AUDIO_LABELS: Record<AudioSource, string> = {
  sync: 'Звук із кадру',
  voiceover: 'Голос поверх',
  trend: 'Трендовий звук',
  mute: 'Без звуку',
};

export const AUDIO_HINTS: Record<AudioSource, string> = {
  sync: 'Людина говорить у кадрі',
  voiceover: 'Голос із попереднього дубля продовжується',
  trend: 'Зверху йде трендовий звук',
  mute: 'Тиша під цей кадр',
};

/**
 * The sound a block has when nothing was chosen: someone on camera is heard,
 * everything else is silent unless said otherwise. Keeps the UI honest without
 * writing a value the user never picked.
 */
export function effectiveAudio(b: ReelBlock): AudioSource {
  if (b.audioSource) return b.audioSource;
  return b.kind === 'talk' || b.kind === 'dialogue' ? 'sync' : 'mute';
}

export type ReelBlock = {
  id: string;
  projectId: string;
  orderIndex: number;
  kind: BlockKind;
  speaker: string | null;
  spoken: string | null;
  screenText: string | null;
  recordNote: string | null;
  assetKind: AssetKind | null;
  assetNote: string | null;
  assetUrl: string | null;
  editNote: string | null;
  overlays: Overlay[];
  audioSource: AudioSource | null;
  durationSec: number | null;
};

export const BLOCK_KINDS: readonly BlockKind[] = ['talk', 'dialogue', 'text', 'broll', 'sound'];

export const BLOCK_LABELS: Record<BlockKind, string> = {
  talk: 'Говорю в камеру',
  dialogue: 'Діалог',
  text: 'Текст на екрані',
  broll: 'Відео / нарізка',
  sound: 'Звук / тренд',
};

/** One line explaining what the block is FOR, shown when picking one. */
export const BLOCK_HINTS: Record<BlockKind, string> = {
  talk: 'Кажу текст у камеру',
  dialogue: 'Репліка конкретної людини',
  text: 'Напис на екрані, нічого не кажу',
  broll: 'Кадр, який треба зняти або знайти',
  sound: 'Трендовий звук чи референс',
};

export const BLOCK_COLORS: Record<BlockKind, string> = {
  talk: '#004BA8',
  dialogue: '#7A3CE0',
  text: '#C08C28',
  broll: '#0F8A6A',
  sound: '#E0644A',
};

export const ASSET_KINDS: readonly AssetKind[] = ['film', 'find', 'screenshot', 'photo'];

export const ASSET_LABELS: Record<AssetKind, string> = {
  film: 'Зняти',
  find: 'Знайти',
  screenshot: 'Скріншот',
  photo: 'Фото',
};

const EMPTY = (v: string | null | undefined): boolean => !(v ?? '').trim();

/** A block with nothing in it yet — used to skip blanks in every summary. */
export function isBlockEmpty(b: ReelBlock): boolean {
  return (
    EMPTY(b.spoken) &&
    EMPTY(b.screenText) &&
    EMPTY(b.recordNote) &&
    EMPTY(b.assetNote) &&
    EMPTY(b.editNote) &&
    b.overlays.length === 0
  );
}

/**
 * Does a camera have to point at something for this block?
 *
 * `talk` and `dialogue` always do — someone is on screen saying words. `broll`
 * does only when the clip must be FILMED; one that is found or screenshotted is
 * an editing job, not a shooting day. `text` and `sound` never do.
 *
 * This is the predicate the shot list is built from, so "what do I actually have
 * to record" has exactly one definition in the codebase.
 */
export function needsCamera(b: ReelBlock): boolean {
  if (b.kind === 'talk' || b.kind === 'dialogue') return true;
  if (b.kind === 'broll') return b.assetKind === 'film' || b.assetKind === 'photo';
  return false;
}

/** Does the editor have work here beyond cutting the takes together? */
export function needsEditing(b: ReelBlock): boolean {
  if (!EMPTY(b.editNote) || b.overlays.length > 0) return true;
  if (b.kind === 'text' || b.kind === 'sound') return true;
  return b.kind === 'broll' && (b.assetKind === 'find' || b.assetKind === 'screenshot');
}

/** Everything said out loud, in order — the script, with speakers where named. */
export function spokenScript(blocks: ReadonlyArray<ReelBlock>): string {
  return blocks
    .filter((b) => !EMPTY(b.spoken))
    .map((b) => {
      const line = (b.spoken ?? '').trim();
      return b.kind === 'dialogue' && !EMPTY(b.speaker) ? `${b.speaker!.trim()}: ${line}` : line;
    })
    .join('\n\n');
}

/** Rough spoken length, for "is this reel too long" — ~2.6 words/second. */
export function estimateSeconds(blocks: ReadonlyArray<ReelBlock>): number {
  const words = spokenScript(blocks).split(/\s+/).filter(Boolean).length;
  const spoken = Math.round(words / 2.6);
  // Text cards and b-roll take screen time even with nothing said over them.
  const silent = blocks.filter((b) => EMPTY(b.spoken) && !isBlockEmpty(b)).length * 2;
  return spoken + silent;
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** One thing to capture, as it appears on the shot list. */
export type ShotItem = {
  /** 1-based position of the block it came from, so it maps back to the script. */
  at: number;
  kind: BlockKind;
  /** «Зняти» / «Знайти» / null when it is simply the creator talking. */
  action: AssetKind | null;
  /** What to point the camera at, or what to go and find. */
  what: string;
  /** The words said during it, so the shot is filmed with its text in hand. */
  saying: string | null;
  url: string | null;
};

/**
 * The shot list: everything that has to exist before an edit can start.
 *
 * Ordered by the reel, not grouped by type — someone filming works down the reel
 * once. Blocks needing a camera come out as shots; `find`/`screenshot` assets
 * come out too, because "which videos do we need" includes the ones nobody
 * films.
 */
export function shotList(blocks: ReadonlyArray<ReelBlock>): ShotItem[] {
  const out: ShotItem[] = [];
  blocks.forEach((b, i) => {
    if (isBlockEmpty(b)) return;
    const saying = EMPTY(b.spoken) ? null : (b.spoken ?? '').trim();

    if (b.kind === 'talk' || b.kind === 'dialogue') {
      out.push({
        at: i + 1,
        kind: b.kind,
        action: null,
        what: EMPTY(b.recordNote)
          ? b.kind === 'dialogue' && !EMPTY(b.speaker)
            ? `${b.speaker!.trim()} говорить`
            : 'Говорю в камеру'
          : (b.recordNote ?? '').trim(),
        saying,
        url: null,
      });
    }

    if (!EMPTY(b.assetNote) || b.assetKind) {
      out.push({
        at: i + 1,
        kind: 'broll',
        action: b.assetKind,
        what: EMPTY(b.assetNote) ? 'Відео' : (b.assetNote ?? '').trim(),
        saying: b.kind === 'broll' ? saying : null,
        url: EMPTY(b.assetUrl) ? null : (b.assetUrl ?? '').trim(),
      });
    }
  });
  return out;
}

/** One editing instruction, as it appears on the edit list. */
export type EditItem = { at: number; what: string };

/** Everything the editor has to do, in reel order. */
export function editList(blocks: ReadonlyArray<ReelBlock>): EditItem[] {
  const out: EditItem[] = [];
  blocks.forEach((b, i) => {
    if (isBlockEmpty(b)) return;
    const at = i + 1;

    if (!EMPTY(b.screenText)) out.push({ at, what: `Текст на екрані: «${(b.screenText ?? '').trim()}»` });

    // Anchored add-ons read as an instruction with its cue: the editor is told
    // WHEN, in the creator's own words, not at a timecode nobody has yet.
    for (const o of b.overlays) {
      const label = OVERLAY_LABELS[o.kind] ?? 'Вставка';
      const what = EMPTY(o.note) ? label : `${label}: ${o.note.trim()}`;
      const cue = EMPTY(o.anchorText) ? '' : `на «${o.anchorText.trim()}» — `;
      out.push({ at, what: `${cue}${what}` });
    }

    // Sound only earns a line when it is NOT what the picture implies — saying
    // "звук із кадру" under a talking head is noise the editor has to read past.
    const audio = effectiveAudio(b);
    if (audio === 'voiceover') out.push({ at, what: 'Голос продовжується поверх цього кадру' });
    if (audio === 'trend' && b.kind !== 'sound') out.push({ at, what: 'Трендовий звук поверх' });
    if (audio === 'mute' && b.kind !== 'text') out.push({ at, what: 'Без звуку' });

    if (b.kind === 'sound' && !EMPTY(b.assetNote)) {
      out.push({ at, what: `Звук: ${(b.assetNote ?? '').trim()}` });
    }
    if (b.kind === 'broll' && (b.assetKind === 'find' || b.assetKind === 'screenshot')) {
      out.push({
        at,
        what: `${ASSET_LABELS[b.assetKind]}: ${EMPTY(b.assetNote) ? 'відео' : (b.assetNote ?? '').trim()}`,
      });
    }
    if (!EMPTY(b.editNote)) out.push({ at, what: (b.editNote ?? '').trim() });
  });
  return out;
}

/** «3 зняти · 2 знайти» — what the reel costs, before anyone opens it. */
export function shotSummary(blocks: ReadonlyArray<ReelBlock>): string {
  const shots = shotList(blocks);
  const toFilm = shots.filter((s) => s.action === null || s.action === 'film' || s.action === 'photo').length;
  const toFind = shots.filter((s) => s.action === 'find' || s.action === 'screenshot').length;
  const parts: string[] = [];
  if (toFilm) parts.push(`${toFilm} зняти`);
  if (toFind) parts.push(`${toFind} знайти`);
  return parts.join(' · ');
}

/** A fresh block of the given kind, ready to insert at the end. */
export function emptyBlock(kind: BlockKind, projectId: string, orderIndex: number, id: string): ReelBlock {
  return {
    id,
    projectId,
    orderIndex,
    kind,
    speaker: null,
    spoken: null,
    screenText: null,
    recordNote: null,
    // A b-roll block starts as "film it" — the common case, and it makes the
    // block appear on the shot list immediately rather than only once typed in.
    assetKind: kind === 'broll' ? 'film' : null,
    assetNote: null,
    assetUrl: null,
    editNote: null,
    overlays: [],
    // A cutaway defaults to the voice carrying over it — that is what a cutaway
    // is FOR. Anything else is a choice the user makes explicitly.
    audioSource: kind === 'broll' ? 'voiceover' : null,
    durationSec: null,
  };
}

type BlockRow = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

/** Database row → block. Tolerant: an unknown kind reads as a plain talk block. */
export function toReelBlock(row: BlockRow): ReelBlock {
  const kind = BLOCK_KINDS.includes(row.kind as BlockKind) ? (row.kind as BlockKind) : 'talk';
  const rawOverlays = Array.isArray(row.overlays) ? row.overlays : [];
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    orderIndex: typeof row.order_index === 'number' ? row.order_index : 0,
    kind,
    speaker: str(row.speaker),
    spoken: str(row.spoken),
    screenText: str(row.screen_text),
    recordNote: str(row.record_note),
    assetKind: ASSET_KINDS.includes(row.asset_kind as AssetKind) ? (row.asset_kind as AssetKind) : null,
    assetNote: str(row.asset_note),
    assetUrl: str(row.asset_url),
    editNote: str(row.edit_note),
    overlays: rawOverlays.filter((o): o is Overlay => !!o && typeof o === 'object'),
    audioSource: AUDIO_SOURCES.includes(row.audio_source as AudioSource)
      ? (row.audio_source as AudioSource)
      : null,
    durationSec: typeof row.duration_sec === 'number' ? row.duration_sec : null,
  };
}
