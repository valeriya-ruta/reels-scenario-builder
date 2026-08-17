import { test, expect } from '@playwright/test';
import {
  editKey,
  editList,
  effectiveAudio,
  emptyBlock,
  resolveOverlays,
  shotGroups,
  shotKey,
  shotList,
  shotSummary,
  spokenScript,
  textRuns,
  type Overlay,
  type ReelBlock,
} from '@/lib/reels/blocks';

/**
 * The shot list and the edit list are DERIVED from the blocks, and the client's
 * shared page renders the same derivation the builder shows. So these are the
 * rules that decide what someone is told to film — and the anchoring that has to
 * survive the script being rewritten around it.
 */

const block = (over: Partial<ReelBlock> = {}): ReelBlock => ({
  ...emptyBlock('talk', 'p1', 0, 'b1'),
  ...over,
});

const overlay = (over: Partial<Overlay> = {}): Overlay => ({
  id: 'o1',
  anchorText: '',
  anchorStart: 0,
  kind: 'image',
  note: '',
  ...over,
});

test.describe('reel blocks — sound is its own axis', () => {
  test('someone on camera is heard; everything else is silent unless said', () => {
    expect(effectiveAudio(block({ kind: 'talk' }))).toBe('sync');
    expect(effectiveAudio(block({ kind: 'dialogue' }))).toBe('sync');
    expect(effectiveAudio(block({ kind: 'text', audioSource: null }))).toBe('mute');
  });

  test('a cutaway is born carrying the voice over it', () => {
    const b = emptyBlock('broll', 'p1', 1, 'b2');
    expect(b.audioSource).toBe('voiceover');
    expect(b.assetKind).toBe('film');
  });

  test('the edit list states the sound only when it is not the obvious one', () => {
    const talking = editList([block({ kind: 'talk', spoken: 'Привіт' })]);
    expect(talking.some((e) => e.what.includes('Звук із кадру'))).toBe(false);

    const cutaway = editList([
      block({ kind: 'broll', assetKind: 'film', assetNote: 'кава', audioSource: 'voiceover' }),
    ]);
    expect(cutaway.some((e) => e.what === 'Голос продовжується поверх цього кадру')).toBe(true);
  });
});

test.describe('reel blocks — what has to be captured', () => {
  test('a talking block is a shot, and carries its words to the set', () => {
    const [shot] = shotList([block({ kind: 'talk', spoken: 'Скільки це коштує?' })]);
    expect(shot.action).toBeNull();
    expect(shot.saying).toBe('Скільки це коштує?');
  });

  test('a dialogue shot is labelled with who is speaking', () => {
    const [shot] = shotList([block({ kind: 'dialogue', speaker: 'Вона', spoken: 'Ні' })]);
    expect(shot.what).toBe('Вона говорить');
  });

  test('b-roll appears whether it is filmed or merely found', () => {
    const shots = shotList([
      block({ kind: 'broll', assetKind: 'film', assetNote: 'руки крупно' }),
      block({ kind: 'broll', assetKind: 'find', assetNote: 'архівне відео' }),
    ]);
    expect(shots.map((s) => s.action)).toEqual(['film', 'find']);
    // "which videos do we need" includes the ones nobody has to film.
    expect(shots[1].what).toBe('архівне відео');
  });

  test('empty blocks never reach the shot list', () => {
    expect(shotList([block({ kind: 'talk' })])).toEqual([]);
  });

  test('the summary splits filming from finding', () => {
    const s = shotSummary([
      block({ kind: 'talk', spoken: 'Привіт' }),
      block({ kind: 'broll', assetKind: 'film', assetNote: 'кава' }),
      block({ kind: 'broll', assetKind: 'find', assetNote: 'сток' }),
    ]);
    expect(s).toBe('2 зняти · 1 знайти');
  });
});

test.describe('reel blocks — add-ons anchored to phrases', () => {
  const text = 'Це коштує дорого, але дорого — не завжди погано';
  // Offsets are computed, not counted by hand: these are the positions a real
  // text selection would report.
  const first = text.indexOf('дорого');
  const second = text.indexOf('дорого', first + 1);

  test('an anchor resolves at its exact offset', () => {
    const o = overlay({ anchorText: 'дорого', anchorStart: first });
    const [r] = resolveOverlays(text, [o]);
    expect([r.start, r.end]).toEqual([first, first + 6]);
    expect(r.detached).toBe(false);
  });

  test('a repeated phrase keeps the anchor nearest where it was made', () => {
    const [r] = resolveOverlays(text, [overlay({ id: 'o2', anchorText: 'дорого', anchorStart: second })]);
    // Both occurrences match; the one that was selected is the one that wins.
    expect(r.start).toBe(second);
  });

  test('editing the text above an anchor re-finds it rather than losing it', () => {
    const prefix = 'Слухай, ';
    const o = overlay({ anchorText: 'дорого', anchorStart: first });
    const [r] = resolveOverlays(`${prefix}${text}`, [o]);
    expect(r.detached).toBe(false);
    expect(r.start).toBe(first + prefix.length);
  });

  test('a deleted phrase detaches the add-on instead of deleting it', () => {
    const o = overlay({ anchorText: 'дорого', anchorStart: 11 });
    const [r] = resolveOverlays('Це коштує нормально', [o]);
    expect(r.detached).toBe(true);
    expect(r.start).toBeNull();
  });

  test('runs split the text so anchored phrases can be underlined', () => {
    const runs = textRuns('Це дорого справді', [
      overlay({ anchorText: 'дорого', anchorStart: 3 }),
    ]);
    expect(runs.map((r) => r.text)).toEqual(['Це ', 'дорого', ' справді']);
    expect(runs[1].overlayIds).toEqual(['o1']);
  });

  test('the edit list reads as an instruction with its cue', () => {
    const items = editList([
      block({
        kind: 'talk',
        spoken: 'Це коштує дорого',
        overlays: [
          overlay({
            anchorText: 'дорого',
            anchorStart: 'Це коштує дорого'.indexOf('дорого'),
            kind: 'image',
            note: 'скріншот цін',
          }),
        ],
      }),
    ]);
    expect(items[0].what).toBe('на «дорого» — Фото: скріншот цін');
  });
});

test.describe('reel blocks — the script', () => {
  test('dialogue lines carry their speaker, monologue does not', () => {
    const script = spokenScript([
      block({ kind: 'talk', spoken: 'Почнемо' }),
      block({ kind: 'dialogue', speaker: 'Вона', spoken: 'Ні' }),
    ]);
    expect(script).toBe('Почнемо\n\nВона: Ні');
  });

  test('blocks with nothing spoken leave no gap in the script', () => {
    const script = spokenScript([
      block({ kind: 'talk', spoken: 'Привіт' }),
      block({ kind: 'broll', assetNote: 'кава' }),
      block({ kind: 'talk', spoken: 'Бувай' }),
    ]);
    expect(script).toBe('Привіт\n\nБувай');
  });
});

/**
 * A tick made on the shared page has to survive the reel being edited around it.
 * Ticks are stored against these keys, so if a key moved when a block was
 * dragged or a line reworded, "already filmed" would silently jump to a
 * different shot — the one failure mode that makes the whole feature worse than
 * no feature.
 */
test.describe('reel blocks — progress keys', () => {
  test('a shot key names the block and its half, never its position', () => {
    const blocks = [
      block({ id: 'a', kind: 'talk', spoken: 'Перше' }),
      block({ id: 'b', kind: 'broll', assetNote: 'кава', assetKind: 'film' }),
    ];
    const before = shotList(blocks).map(shotKey);

    // Same blocks, opposite order, one of them reworded.
    const after = shotList([
      { ...blocks[1] },
      { ...blocks[0], spoken: 'Перше, але інакше' },
    ]).map(shotKey);

    expect(before.sort()).toEqual(after.sort());
    expect(before.every((k) => /^[ab]:(take|asset)$/.test(k))).toBe(true);
  });

  test('a talking block with an asset yields two distinct keys', () => {
    const keys = shotList([
      block({ id: 'a', kind: 'talk', spoken: 'Кажу', assetKind: 'find', assetNote: 'референс' }),
    ]).map(shotKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('an edit key follows its overlay, not its place in the list', () => {
    const withOne = editList([
      block({
        id: 'a',
        kind: 'talk',
        spoken: 'Це коштує дорого',
        overlays: [
          overlay({ id: 'o2', anchorText: 'дорого', anchorStart: 'Це коштує дорого'.indexOf('дорого'), kind: 'image', note: 'ціни' }),
        ],
      }),
    ]).map(editKey);

    // Another overlay is added ABOVE it later — the existing key must not shift.
    const withTwo = editList([
      block({
        id: 'a',
        kind: 'talk',
        spoken: 'Це коштує дорого',
        overlays: [
          overlay({ id: 'o1', anchorText: 'Це', anchorStart: 0, kind: 'image', note: 'обкладинка' }),
          overlay({ id: 'o2', anchorText: 'дорого', anchorStart: 'Це коштує дорого'.indexOf('дорого'), kind: 'image', note: 'ціни' }),
        ],
      }),
    ]).map(editKey);

    expect(withOne).toEqual(['a:edit:ov:o2']);
    expect(withTwo).toContain('a:edit:ov:o2');
  });

  test('shot keys and edit keys never collide', () => {
    const blocks = [
      block({ id: 'a', kind: 'talk', spoken: 'Кажу', editNote: 'різати швидко' }),
      block({ id: 'b', kind: 'broll', assetNote: 'кава', assetKind: 'film' }),
    ];
    const all = [...shotList(blocks).map(shotKey), ...editList(blocks).map(editKey)];
    expect(new Set(all).size).toBe(all.length);
  });
});

/**
 * The shot list is grouped by the TYPE of work, because that is how filming
 * actually happens: one sitting for the whole text, then a separate hunt for
 * the cutaways. A list in reel order sends you back and forth between the two.
 */
test.describe('reel blocks — the shot list grouped by type', () => {
  const talkingReel = [
    block({ id: 'a', kind: 'talk', spoken: 'Перший абзац' }),
    block({
      id: 'b',
      kind: 'talk',
      spoken: 'Другий абзац',
      overlays: [
        overlay({ id: 'ov1', kind: 'video', note: 'кадри з офісу', anchorText: 'Другий', anchorStart: 0 }),
      ],
    }),
    block({ id: 'c', kind: 'talk', spoken: 'Третій абзац' }),
  ];

  test('a plain talking head is ONE row carrying the whole text', () => {
    const talk = shotGroups(talkingReel).find((g) => g.id === 'talk');
    expect(talk?.items).toHaveLength(1);
    expect(talk?.items[0].saying).toBe('Перший абзац\n\nДругий абзац\n\nТретій абзац');
    expect(talk?.items[0].keys).toEqual(['a:take', 'b:take', 'c:take']);
  });

  test('b-roll asked for mid-sentence gets its own pile, with its cue', () => {
    const video = shotGroups(talkingReel).find((g) => g.id === 'ov-video');
    expect(video?.items).toHaveLength(1);
    expect(video?.items[0].what).toBe('кадри з офісу');
    expect(video?.items[0].cue).toBe('Другий');
  });

  test('filming it and placing it in the edit are two separate ticks', () => {
    const shot = shotList(talkingReel).find((s) => s.group === 'ov-video')!;
    const edits = editList(talkingReel).map(editKey);
    expect(shotKey(shot)).toBe('b:shot:ov:ov1');
    expect(edits).toContain('b:edit:ov:ov1');
    expect(edits).not.toContain(shotKey(shot));
  });

  test('a take with its own setup note stays a separate row', () => {
    const talk = shotGroups([
      block({ id: 'a', kind: 'talk', spoken: 'У кадрі' }),
      block({ id: 'b', kind: 'talk', spoken: 'На вулиці', recordNote: 'Зняти на вулиці' }),
    ]).find((g) => g.id === 'talk');

    expect(talk?.items.map((i) => i.what)).toEqual(['Весь текст підряд', 'Зняти на вулиці']);
    expect(talk?.items[1].keys).toEqual(['b:take']);
  });

  test('two speakers do not end up in one pile', () => {
    const talk = shotGroups([
      block({ id: 'a', kind: 'dialogue', speaker: 'Вона', spoken: 'Раз' }),
      block({ id: 'b', kind: 'dialogue', speaker: 'Він', spoken: 'Два' }),
      block({ id: 'c', kind: 'dialogue', speaker: 'Вона', spoken: 'Три' }),
    ]).find((g) => g.id === 'talk');

    expect(talk?.items).toHaveLength(2);
    expect(talk?.items.find((i) => i.what.startsWith('Вона'))?.saying).toBe('Раз\n\nТри');
  });

  test('assets split into what to film and what to find', () => {
    const ids = shotGroups([
      block({ id: 'a', kind: 'broll', assetKind: 'film', assetNote: 'кава' }),
      block({ id: 'b', kind: 'broll', assetKind: 'find', assetNote: 'тренд' }),
    ]).map((g) => g.id);
    expect(ids).toEqual(['film', 'find']);
  });

  test('an empty reel has no groups rather than empty ones', () => {
    expect(shotGroups([])).toEqual([]);
  });
});
