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

/**
 * One shot inside a cutaway block.
 *
 * A fast-cut sequence — video, video, video, each with its own words on screen —
 * is ONE beat of a reel, not eight. Making it eight blocks buries the script in
 * boilerplate and makes reordering the sequence a chore, so a `broll` block
 * holds a list of clips instead: what happens, what is written over it, what is
 * heard over it.
 */
export type Clip = {
  id: string;
  /** What is happening in this shot. */
  what: string;
  /** Words burnt over this shot, if any. */
  screenText?: string;
  /** Sound over this shot, when it is not the block's. */
  soundNote?: string;
  /** Film it / find it / … Falls back to the block's when unset. */
  assetKind?: AssetKind | null;
  url?: string;
  /** A pasted picture of what this shot should look like. */
  image?: string;
};

/**
 * A picture pasted onto a block — «отак має виглядати кадр».
 *
 * Pasted, never uploaded through a picker: the useful gesture is Ctrl+V from
 * wherever the reference was found, and anything more is enough friction that
 * the picture simply never gets attached.
 */
export type RefImage = {
  id: string;
  url: string;
  note?: string;
};

/** Parse a stored `[{id,url,note?}]` list — block pictures and reel references
 *  are the same shape, because a reference is a URL whichever way it arrived. */
export function toRefImages(value: unknown): RefImage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (i): i is RefImage =>
      !!i && typeof i === 'object' && typeof (i as RefImage).url === 'string' && !!(i as RefImage).url,
  );
}

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
 * The sound a block actually has.
 *
 * Three layers, narrowest first: what this block says, then what the whole reel
 * says, then what the picture implies. The reel level exists because a trend is
 * usually a property of the REEL — setting it on every block one at a time is
 * both tedious and how the edit list ends up repeating «трендовий звук» eight
 * times, which reads as eight separate instructions.
 */
export function effectiveAudio(b: ReelBlock, reelAudio?: AudioSource | null): AudioSource {
  if (b.audioSource) return b.audioSource;
  if (reelAudio) return reelAudio;
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
  /** Shots inside this block, in order. Cutaway blocks only. */
  clips: Clip[];
  /** Reference pictures pasted onto this block. */
  images: RefImage[];
  audioSource: AudioSource | null;
  durationSec: number | null;
};

/**
 * Every column `toReelBlock` reads, as one string.
 *
 * It was hand-copied into three files, and adding `clips` to two of them left
 * the third silently returning blocks with no shots: everything typed into a
 * cutaway was stored correctly and then vanished on reload, because the read
 * never asked for the column. One constant, so a new field cannot be added to
 * the model and forgotten by a reader.
 */
export const REEL_BLOCK_COLUMNS =
  'id,project_id,order_index,kind,speaker,spoken,screen_text,record_note,asset_kind,asset_note,asset_url,edit_note,overlays,clips,images,audio_source,duration_sec';

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
  talk: 'Кажу текст у камеру. Можна весь текст одним блоком',
  dialogue: 'Репліка конкретної людини',
  text: 'Напис на екрані, нічого не кажу',
  broll: 'Кадри поспіль: відео, відео, відео — кожне зі своїм написом',
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
    b.overlays.length === 0 &&
    b.clips.length === 0 &&
    b.images.length === 0
  );
}

/**
 * The shots inside a cutaway block, in order.
 *
 * A block written before clips existed — or one holding a single shot — has its
 * asset in the block's own columns. It reads as one clip here so every list has
 * a single shape to walk, and the editor migrates those columns into `clips` the
 * first time the block is touched.
 */
export function blockClips(b: ReelBlock): Clip[] {
  if (b.clips.length > 0) return b.clips;
  if (b.kind !== 'broll') return [];
  if (EMPTY(b.assetNote) && !b.assetKind && EMPTY(b.assetUrl)) return [];
  return [
    {
      id: `${b.id}:0`,
      what: (b.assetNote ?? '').trim(),
      assetKind: b.assetKind,
      ...(EMPTY(b.assetUrl) ? {} : { url: (b.assetUrl ?? '').trim() }),
    },
  ];
}

/** Is this clip worth showing at all? */
export function isClipEmpty(c: Clip): boolean {
  return (
    EMPTY(c.what) && EMPTY(c.screenText) && EMPTY(c.soundNote) && EMPTY(c.url) && EMPTY(c.image)
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

/**
 * Conversational Ukrainian, spoken to camera. Exported because the edit list
 * derives a timecode for every overlay from the same pace — two pace constants
 * would put the shot list and the edit list on different clocks.
 */
export const WORDS_PER_SECOND = 2.6;

/** How long a block with nothing spoken still occupies the screen. */
export const SILENT_BLOCK_SECONDS = 2;

/** Rough spoken length, for "is this reel too long". */
export function estimateSeconds(blocks: ReadonlyArray<ReelBlock>): number {
  const words = spokenScript(blocks).split(/\s+/).filter(Boolean).length;
  const spoken = Math.round(words / WORDS_PER_SECOND);
  // Text cards and b-roll take screen time even with nothing said over them.
  const silent =
    blocks.filter((b) => EMPTY(b.spoken) && !isBlockEmpty(b)).length * SILENT_BLOCK_SECONDS;
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
  /**
   * The block this came from, and which half of it. A shot has no row of its
   * own — the list is derived — so this pair is its identity when someone ticks
   * it off as recorded. Stable across edits to the text, which a positional
   * index would not be.
   */
  blockId: string;
  slot: 'take' | 'asset' | `shot:ov:${string}` | `shot:clip:${string}`;
  kind: BlockKind;
  /** «Зняти» / «Знайти» / null when it is simply the creator talking. */
  action: AssetKind | null;
  /** What to point the camera at, or what to go and find. */
  what: string;
  /** The words said during it, so the shot is filmed with its text in hand. */
  saying: string | null;
  url: string | null;
  /** Which pile of work this belongs to — see `shotGroups`. */
  group: ShotGroupId;
  /** Whose take it is, so two people's lines don't end up in one pile. */
  speaker: string | null;
  /** For b-roll asked for mid-sentence: the words it lands on. */
  cue: string | null;
  /** Words burnt over this shot — you frame differently when a line must fit. */
  screen?: string | null;
  /** A pasted picture of what this should look like. */
  image?: string | null;
};

/**
 * The piles a shot list splits into. You do not shoot a reel by walking down it
 * once: you sit down and say the whole text, then you go and get the cutaways.
 */
export type ShotGroupId = 'talk' | 'film' | 'find' | 'screenshot' | 'photo' | 'ov-video' | 'ov-image';

export const SHOT_GROUP_LABELS: Record<ShotGroupId, string> = {
  talk: 'Говоряща голова',
  film: 'Зняти окремо',
  find: 'Знайти',
  screenshot: 'Скріншоти',
  photo: 'Фото',
  'ov-video': 'Відео поверх',
  'ov-image': 'Фото поверх',
};

const SHOT_GROUP_ORDER: ShotGroupId[] = ['talk', 'film', 'ov-video', 'find', 'ov-image', 'screenshot', 'photo'];

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
        blockId: b.id,
        slot: 'take',
        kind: b.kind,
        action: null,
        what: EMPTY(b.recordNote)
          ? b.kind === 'dialogue' && !EMPTY(b.speaker)
            ? `${b.speaker!.trim()} говорить`
            : 'Говорю в камеру'
          : (b.recordNote ?? '').trim(),
        saying,
        url: null,
        group: 'talk',
        speaker: EMPTY(b.speaker) ? null : b.speaker!.trim(),
        cue: null,
      });
    }

    // A sound block keeps its note in the same field as a cutaway's, but a song
    // is not something anyone points a camera at — finding it and laying it under
    // the picture is editing work, and `editList` already carries it as «Звук: …».
    // A cutaway is a LIST of shots — one row each, so «відео, відео, відео» is
    // three things to get rather than one line saying "some videos".
    //
    // Only REAL clips take this path. A block written before clips existed keeps
    // its `asset` slot: switching it would change the key its «знято» tick is
    // stored under, and silently lose progress somebody had already marked.
    const clips = b.clips;
    if (clips.length > 0) {
      clips.forEach((c, ci) => {
        if (isClipEmpty(c)) return;
        const action = c.assetKind ?? b.assetKind ?? null;
        out.push({
          at: i + 1,
          blockId: b.id,
          // `shot:` prefix so ticking "filmed" stays separate from the editing
          // instruction for the same clip.
          slot: `shot:clip:${c.id}`,
          kind: 'broll',
          action,
          what: EMPTY(c.what) ? `Кадр ${ci + 1}` : c.what.trim(),
          saying: null,
          url: EMPTY(c.url) ? null : (c.url ?? '').trim(),
          group: action ?? 'film',
          speaker: null,
          cue: null,
          // The words burnt over it belong with the shot: you frame differently
          // when you know a line has to fit on screen.
          screen: EMPTY(c.screenText) ? null : (c.screenText ?? '').trim(),
          image: EMPTY(c.image) ? null : (c.image ?? '').trim(),
        });
      });
    } else if (b.kind !== 'sound' && (!EMPTY(b.assetNote) || b.assetKind)) {
      out.push({
        at: i + 1,
        blockId: b.id,
        slot: 'asset',
        kind: 'broll',
        action: b.assetKind,
        what: EMPTY(b.assetNote) ? 'Відео' : (b.assetNote ?? '').trim(),
        saying: b.kind === 'broll' ? saying : null,
        url: EMPTY(b.assetUrl) ? null : (b.assetUrl ?? '').trim(),
        group: b.assetKind ?? 'film',
        speaker: null,
        cue: null,
      });
    }

    // Footage asked for mid-sentence («поверх цього — відео з офісу») is a thing
    // somebody has to GO AND GET, so it belongs on the shot list and not only in
    // the editing instructions. Its own slot, `shot:ov:`, keeps "filmed" and
    // "placed in the edit" as two separate ticks — they are two separate jobs.
    for (const o of b.overlays) {
      if (o.kind !== 'video' && o.kind !== 'image') continue;
      out.push({
        at: i + 1,
        blockId: b.id,
        slot: `shot:ov:${o.id}`,
        kind: 'broll',
        action: null,
        what: EMPTY(o.note) ? OVERLAY_LABELS[o.kind] : o.note.trim(),
        saying: null,
        url: EMPTY(o.url) ? null : (o.url ?? '').trim(),
        group: o.kind === 'video' ? 'ov-video' : 'ov-image',
        speaker: null,
        cue: EMPTY(o.anchorText) ? null : o.anchorText.trim(),
      });
    }
  });
  return out;
}

/** One row of the grouped shot list — several takes can share a row. */
export type GroupedShot = {
  /** Every tick key behind the row, so a merged row ticks all of them at once. */
  keys: string[];
  what: string;
  saying: string | null;
  cue: string | null;
  /** A pasted picture of what this should look like. */
  image?: string | null;
  /** Words burnt over this shot. */
  screen?: string | null;
  url: string | null;
  action: AssetKind | null;
  kind: BlockKind;
  /** Position in the reel, or null when the row merges several. */
  at: number | null;
};

export type ShotGroup = { id: ShotGroupId; title: string; items: GroupedShot[] };

/**
 * The shot list as piles of work rather than a walk down the reel.
 *
 * Nobody films a talking head one paragraph at a time — you sit down once and
 * say the whole thing. So every plain take merges into a single row carrying the
 * full text, and only takes with their own setup note («зняти на вулиці») stay
 * separate, because those really are separate sittings. Everything else — the
 * cutaways to film, the clips to find, the b-roll asked for mid-sentence —
 * lands in its own pile, which is how you actually collect it.
 */
export function shotGroups(blocks: ReadonlyArray<ReelBlock>): ShotGroup[] {
  const shots = shotList(blocks);
  const byGroup = new Map<ShotGroupId, ShotItem[]>();
  for (const s of shots) {
    const list = byGroup.get(s.group);
    if (list) list.push(s);
    else byGroup.set(s.group, [s]);
  }

  const groups: ShotGroup[] = [];
  for (const id of SHOT_GROUP_ORDER) {
    const items = byGroup.get(id);
    if (!items || items.length === 0) continue;
    groups.push({
      id,
      title: SHOT_GROUP_LABELS[id],
      items: id === 'talk' ? mergeTakes(items) : items.map(oneRow),
    });
  }
  return groups;
}

function oneRow(s: ShotItem): GroupedShot {
  return {
    keys: [shotKey(s)],
    what: s.what,
    saying: s.saying,
    cue: s.cue,
    screen: s.screen ?? null,
    image: s.image ?? null,
    url: s.url,
    action: s.action,
    kind: s.kind,
    at: s.at,
  };
}

/** Plain takes collapse into one row per speaker; noted setups stay their own. */
function mergeTakes(items: ShotItem[]): GroupedShot[] {
  const plain = new Map<string, ShotItem[]>();
  const noted: GroupedShot[] = [];

  for (const s of items) {
    const isPlain = s.what === 'Говорю в камеру' || s.what === `${s.speaker} говорить`;
    if (!isPlain) {
      noted.push(oneRow(s));
      continue;
    }
    const who = s.speaker ?? '';
    const list = plain.get(who);
    if (list) list.push(s);
    else plain.set(who, [s]);
  }

  const merged: GroupedShot[] = [];
  for (const [who, list] of plain) {
    const text = list
      .map((s) => (s.saying ?? '').trim())
      .filter(Boolean)
      .join('\n\n');
    merged.push({
      keys: list.map(shotKey),
      what: who ? `${who} — весь текст` : 'Весь текст підряд',
      saying: text || null,
      cue: null,
      screen: null,
      image: null,
      url: null,
      action: null,
      kind: list[0].kind,
      at: list.length === 1 ? list[0].at : null,
    });
  }

  return [...merged, ...noted];
}

/**
 * One beat of the reel, as a person who has never seen it reads it.
 *
 * The shot list and the edit list answer "what do I have to do". Neither
 * answers "what IS this reel", which is the first thing anyone opening a link
 * needs: what happens on screen, in order, with the words that go over it.
 * Without it the page opens on six «знайти» rows and no context at all.
 */
export type FlowBeat = {
  at: number;
  blockId: string;
  kind: BlockKind;
  /** «Говорю в камеру», «Відео / нарізка» … */
  label: string;
  /** What the viewer sees, one line per shot. */
  onScreen: string[];
  /** What is said out loud over it. */
  saying: string | null;
  /** Words burnt onto the picture. */
  screenText: string[];
  /** Reference pictures — the block's, plus each clip's. */
  images: string[];
  /** Reference links worth watching next to the plan. */
  links: string[];
  /** What is heard, and whether that differs from the rest of the reel. */
  audio: AudioSource;
  audioDiffers: boolean;
  /** Roughly how long this beat runs. */
  seconds: number;
};

/** The reel, top to bottom — the answer to "what is this". */
export function flowBeats(
  blocks: ReadonlyArray<ReelBlock>,
  reelAudio?: AudioSource | null,
): FlowBeat[] {
  const out: FlowBeat[] = [];
  blocks.forEach((b, i) => {
    if (isBlockEmpty(b)) return;

    const saying = EMPTY(b.spoken) ? null : (b.spoken ?? '').trim();
    const clips = blockClips(b);
    const onScreen: string[] = [];
    const screenText: string[] = [];
    const images: string[] = b.images.map((i) => i.url).filter(Boolean);
    const links: string[] = [];
    if (!EMPTY(b.assetUrl)) links.push((b.assetUrl ?? '').trim());

    if (b.kind === 'talk' || b.kind === 'dialogue') {
      onScreen.push(
        EMPTY(b.recordNote)
          ? b.kind === 'dialogue' && !EMPTY(b.speaker)
            ? `${b.speaker!.trim()} говорить у кадрі`
            : 'Ти в кадрі, говориш'
          : (b.recordNote ?? '').trim(),
      );
    }

    for (const c of clips) {
      if (isClipEmpty(c)) continue;
      onScreen.push(EMPTY(c.what) ? 'Кадр' : c.what.trim());
      if (!EMPTY(c.screenText)) screenText.push((c.screenText ?? '').trim());
      if (!EMPTY(c.image)) images.push((c.image ?? '').trim());
      if (!EMPTY(c.url)) links.push((c.url ?? '').trim());
    }

    if (b.kind === 'sound' && !EMPTY(b.assetNote)) {
      onScreen.push(`Звук: ${(b.assetNote ?? '').trim()}`);
    }
    if (!EMPTY(b.screenText)) screenText.push((b.screenText ?? '').trim());
    if (b.kind === 'text' && onScreen.length === 0) onScreen.push('Тільки текст на екрані');

    const words = (saying ?? '').split(/\s+/).filter(Boolean).length;
    out.push({
      at: i + 1,
      blockId: b.id,
      kind: b.kind,
      label: BLOCK_LABELS[b.kind],
      onScreen,
      saying,
      screenText,
      images,
      links,
      audio: effectiveAudio(b, reelAudio),
      audioDiffers: !!b.audioSource && b.audioSource !== (reelAudio ?? null),
      seconds:
        words > 0 ? Math.max(1, Math.round(words / WORDS_PER_SECOND)) : SILENT_BLOCK_SECONDS,
    });
  });
  return out;
}

/**
 * One editing instruction, as it appears on the edit list.
 *
 * `slot` identifies WHICH instruction of that block this is, by its source
 * rather than by its position — an overlay carries its own id, the screen text
 * and the note are one apiece. So ticking «зроблено» survives adding another
 * overlay above it, which a positional index would not.
 */
export type EditItem = {
  at: number;
  what: string;
  blockId: string;
  slot: string;
  /** Reference link, where the block carries one — a song has to be findable. */
  url?: string | null;
};

/** The key an edit tick is stored under. */
export function editKey(item: Pick<EditItem, 'blockId' | 'slot'>): string {
  return `${item.blockId}:${item.slot}`;
}

/**
 * Everything the editor has to do for ONE block.
 *
 * Split out from `editList` because the edit view reads down the SCRIPT — each
 * block's words, then what happens over them — rather than as one flat column
 * of tasks divorced from what is being said.
 *
 * `reelAudio` is the reel's own sound setting: an instruction that merely
 * repeats it is dropped, since it is stated once at the top. Saying «трендовий
 * звук» on all eight blocks reads as eight separate cues.
 */
export function editItemsForBlock(
  b: ReelBlock,
  at: number,
  reelAudio?: AudioSource | null,
): EditItem[] {
  const out: EditItem[] = [];
  {
    if (isBlockEmpty(b)) return out;

    if (!EMPTY(b.screenText))
      out.push({
        at,
        blockId: b.id,
        slot: 'edit:screen',
        what: `Текст на екрані: «${(b.screenText ?? '').trim()}»`,
      });

    // Anchored add-ons read as an instruction with its cue: the editor is told
    // WHEN, in the creator's own words, not at a timecode nobody has yet.
    for (const o of b.overlays) {
      const label = OVERLAY_LABELS[o.kind] ?? 'Вставка';
      const what = EMPTY(o.note) ? label : `${label}: ${o.note.trim()}`;
      const cue = EMPTY(o.anchorText) ? '' : `на «${o.anchorText.trim()}» — `;
      out.push({
        at,
        blockId: b.id,
        slot: `edit:ov:${o.id}`,
        what: `${cue}${what}`,
        // Whatever was attached to the phrase — a link or a pasted picture —
        // has to reach the person doing the edit, or the add-on is a sentence
        // about a thing they cannot see.
        url: EMPTY(o.url) ? null : (o.url ?? '').trim(),
      });
    }

    // Sound only earns a line when it is NOT what the picture implies — saying
    // "звук із кадру" under a talking head is noise the editor has to read past
    // — and never when it is simply the reel's own sound, said once at the top.
    const audio = effectiveAudio(b, reelAudio);
    const audioIsTheReels = !b.audioSource && !!reelAudio;
    if (audioIsTheReels) {
      // nothing: the reel's sound is stated once, not per block
    } else if (audio === 'voiceover')
      out.push({ at, blockId: b.id, slot: 'edit:audio', what: 'Голос продовжується поверх цього кадру' });
    else if (audio === 'trend' && b.kind !== 'sound')
      out.push({ at, blockId: b.id, slot: 'edit:audio', what: 'Трендовий звук поверх' });
    else if (audio === 'mute' && b.kind !== 'text')
      out.push({ at, blockId: b.id, slot: 'edit:audio', what: 'Без звуку' });

    if (b.kind === 'sound' && !EMPTY(b.assetNote)) {
      // The link travels WITH the instruction: this is the only place the song
      // appears now that it is off the shot list, and «знайди цей звук» without
      // the reference is a scavenger hunt.
      out.push({
        at,
        blockId: b.id,
        slot: 'edit:sound',
        what: `Звук: ${(b.assetNote ?? '').trim()}`,
        url: EMPTY(b.assetUrl) ? null : (b.assetUrl ?? '').trim(),
      });
    }
    if (b.kind === 'broll' && (b.assetKind === 'find' || b.assetKind === 'screenshot')) {
      out.push({
        at,
        blockId: b.id,
        slot: 'edit:asset',
        what: `${ASSET_LABELS[b.assetKind]}: ${EMPTY(b.assetNote) ? 'відео' : (b.assetNote ?? '').trim()}`,
        url: EMPTY(b.assetUrl) ? null : (b.assetUrl ?? '').trim(),
      });
    }
    // Each clip's own instruction — what is written over it, what is heard.
    b.clips.forEach((c, ci) => {
      if (isClipEmpty(c)) return;
      const parts: string[] = [];
      if (!EMPTY(c.screenText)) parts.push(`напис «${(c.screenText ?? '').trim()}»`);
      if (!EMPTY(c.soundNote)) parts.push(`звук: ${(c.soundNote ?? '').trim()}`);
      if (parts.length === 0) return;
      out.push({
        at,
        blockId: b.id,
        slot: `edit:clip:${c.id}`,
        what: `Кадр ${ci + 1}${EMPTY(c.what) ? '' : ` (${c.what.trim()})`} — ${parts.join(', ')}`,
        url: EMPTY(c.url) ? null : (c.url ?? '').trim(),
      });
    });

    if (!EMPTY(b.editNote))
      out.push({ at, blockId: b.id, slot: 'edit:note', what: (b.editNote ?? '').trim() });
  }
  return out;
}

/** Everything the editor has to do, in reel order. */
export function editList(
  blocks: ReadonlyArray<ReelBlock>,
  reelAudio?: AudioSource | null,
): EditItem[] {
  return blocks.flatMap((b, i) => editItemsForBlock(b, i + 1, reelAudio));
}

/** The key a tick is stored under: block + which half of it. */
export function shotKey(shot: Pick<ShotItem, 'blockId' | 'slot'>): string {
  return `${shot.blockId}:${shot.slot}`;
}

/** «3 зняти · 2 знайти» — what the reel costs, before anyone opens it. */
export function shotSummary(blocks: ReadonlyArray<ReelBlock>): string {
  const shots = shotList(blocks);
  const overlay = shots.filter((s) => s.group === 'ov-video' || s.group === 'ov-image');
  const rest = shots.filter((s) => !overlay.includes(s));
  const toFilm = rest.filter((s) => s.action === null || s.action === 'film' || s.action === 'photo').length;
  const toFind = rest.filter((s) => s.action === 'find' || s.action === 'screenshot').length;
  const parts: string[] = [];
  if (toFilm) parts.push(`${toFilm} зняти`);
  if (toFind) parts.push(`${toFind} знайти`);
  // B-roll asked for inside the text is neither exactly — it is «ще й оце зверху».
  if (overlay.length) parts.push(`${overlay.length} поверх`);
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
    clips: [],
    images: [],
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
    clips: (Array.isArray(row.clips) ? row.clips : []).filter(
      (c): c is Clip => !!c && typeof c === 'object',
    ),
    images: toRefImages(row.images),
    audioSource: AUDIO_SOURCES.includes(row.audio_source as AudioSource)
      ? (row.audio_source as AudioSource)
      : null,
    durationSec: typeof row.duration_sec === 'number' ? row.duration_sec : null,
  };
}
