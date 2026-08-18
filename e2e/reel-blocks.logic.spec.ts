import { test, expect } from '@playwright/test';
import {
  REEL_BLOCK_COLUMNS,
  isBlockEmpty,
  toReelBlock,
  editKey,
  editList,
  effectiveAudio,
  emptyBlock,
  flowBeats,
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

/**
 * A sound block keeps its note in the same column as a cutaway's, so the shot
 * list was telling someone to go and film «Після "do i clench my fists?" мені
 * здається тут ідеально підійде» — a song. Nobody points a camera at a song.
 */
test.describe('a song is editing work, not a shot', () => {
  const soundReel = [
    block({ id: 'a', kind: 'broll', assetKind: 'film', assetNote: 'Зйомка зверху, flatlay' }),
    block({
      id: 'b',
      kind: 'sound',
      assetNote: 'Після "do i clench my fists?" тут ідеально підійде',
      assetUrl: 'https://example.com/track',
      audioSource: 'trend',
    }),
  ];

  test('the sound never reaches the shot list', () => {
    const shots = shotList(soundReel);
    expect(shots).toHaveLength(1);
    expect(shots[0].blockId).toBe('a');
  });

  test('it IS on the edit list, where it belongs', () => {
    const sound = editList(soundReel).find((e) => e.slot === 'edit:sound');
    expect(sound?.what).toContain('do i clench my fists');
  });

  test('the reference link travels with it — this is now its only home', () => {
    const sound = editList(soundReel).find((e) => e.slot === 'edit:sound');
    expect(sound?.url).toBe('https://example.com/track');
  });

  test('a clip to FIND keeps its link on the edit list too', () => {
    const items = editList([
      block({ id: 'c', kind: 'broll', assetKind: 'find', assetNote: 'тренд', assetUrl: 'https://example.com/reel' }),
    ]);
    expect(items.find((e) => e.slot === 'edit:asset')?.url).toBe('https://example.com/reel');
  });

  test('the count stops promising a shot that does not exist', () => {
    expect(shotSummary(soundReel)).toBe('1 зняти');
  });

  test('a cutaway is still a shot — only sound is exempt', () => {
    const shots = shotList([
      block({ id: 'd', kind: 'broll', assetKind: 'film', assetNote: 'кава' }),
    ]);
    expect(shots).toHaveLength(1);
  });
});

/**
 * «Відео, відео, відео, кожне зі своїм написом» is ONE beat of a reel. It used
 * to be one block per clip, which buried the script in boilerplate; a cutaway
 * block now holds a list of shots.
 */
test.describe('one cutaway block, many clips', () => {
  const sequence = block({
    id: 'b',
    kind: 'broll',
    assetKind: 'film',
    clips: [
      { id: 'c1', what: 'Руки гортають блокнот', screenText: 'рік тому', assetKind: 'film' },
      { id: 'c2', what: 'Нарізка з виступу', screenText: 'сьогодні', assetKind: 'find', url: 'https://e.com/x' },
      { id: 'c3', what: '', screenText: '', soundNote: '' },
    ],
  });

  test('every clip is its own shot', () => {
    const shots = shotList([sequence]);
    expect(shots.map((s) => s.what)).toEqual(['Руки гортають блокнот', 'Нарізка з виступу']);
  });

  test('each clip goes to the pile that matches ITS job', () => {
    const groups = shotGroups([sequence]);
    expect(groups.find((g) => g.id === 'film')?.items).toHaveLength(1);
    expect(groups.find((g) => g.id === 'find')?.items).toHaveLength(1);
  });

  test('the words burnt over a clip travel with the shot', () => {
    expect(shotList([sequence])[0].screen).toBe('рік тому');
  });

  test('an empty clip is not a task', () => {
    expect(shotList([sequence])).toHaveLength(2);
  });

  test('clips have their own tick keys, so shots are ticked one by one', () => {
    const keys = shotList([sequence]).map(shotKey);
    expect(keys).toEqual(['b:shot:clip:c1', 'b:shot:clip:c2']);
  });

  test('a block written before clips existed still reads as one shot', () => {
    const legacy = block({ id: 'old', kind: 'broll', assetKind: 'film', assetNote: 'кава', clips: [] });
    const shots = shotList([legacy]);
    expect(shots).toHaveLength(1);
    expect(shots[0].what).toBe('кава');
  });

  test('the editor is told what is written over each clip', () => {
    const items = editList([sequence]).filter((e) => e.slot.startsWith('edit:clip:'));
    expect(items).toHaveLength(2);
    expect(items[0].what).toContain('напис «рік тому»');
    expect(items[1].url).toBe('https://e.com/x');
  });
});

/**
 * A trend belongs to the REEL. Setting it per block meant the edit list repeated
 * «трендовий звук» on every line — eight cues where there is one decision.
 */
test.describe("the reel's own sound", () => {
  const reel = [
    block({ id: 'a', kind: 'talk', spoken: 'Перше' }),
    block({ id: 'b', kind: 'talk', spoken: 'Друге' }),
  ];

  test('a block inherits it', () => {
    expect(effectiveAudio(reel[0], 'trend')).toBe('trend');
  });

  test('a block that says otherwise still wins', () => {
    const own = block({ id: 'c', kind: 'talk', spoken: 'Третє', audioSource: 'mute' });
    expect(effectiveAudio(own, 'trend')).toBe('mute');
  });

  test('inherited sound is NOT repeated as an instruction on every block', () => {
    const audioLines = editList(reel, 'trend').filter((e) => e.slot === 'edit:audio');
    expect(audioLines).toHaveLength(0);
  });

  test('a block that overrides the reel DOES get its line', () => {
    const mixed = [...reel, block({ id: 'c', kind: 'broll', assetNote: 'кадр', audioSource: 'voiceover' })];
    const audioLines = editList(mixed, 'trend').filter((e) => e.slot === 'edit:audio');
    expect(audioLines).toHaveLength(1);
    expect(audioLines[0].blockId).toBe('c');
  });

  test('with no reel sound, the old per-block behaviour is unchanged', () => {
    const solo = [block({ id: 'a', kind: 'broll', assetNote: 'кадр', audioSource: 'voiceover' })];
    expect(editList(solo).filter((e) => e.slot === 'edit:audio')).toHaveLength(1);
  });
});

/**
 * The shared page used to open on «Знайти × 6» and never say what the reel WAS.
 * `flowBeats` is that missing answer: the reel top to bottom — what is said,
 * what is seen, what is heard — for someone who did not write it.
 */
test.describe('the reel, for someone who has never seen it', () => {
  test('a talking beat says who is on screen and what they say', () => {
    const [beat] = flowBeats([block({ id: 'a', kind: 'talk', spoken: 'Привіт, це я' })]);
    expect(beat.saying).toBe('Привіт, це я');
    expect(beat.onScreen).toEqual(['Ти в кадрі, говориш']);
  });

  test('a setup note replaces the generic line, since it IS the framing', () => {
    const [beat] = flowBeats([
      block({ id: 'a', kind: 'talk', spoken: 'Слухай', recordNote: 'Крупний план, вікно за спиною' }),
    ]);
    expect(beat.onScreen).toEqual(['Крупний план, вікно за спиною']);
  });

  test('a dialogue names the speaker', () => {
    const [beat] = flowBeats([block({ id: 'a', kind: 'dialogue', speaker: 'Вона', spoken: 'Ні' })]);
    expect(beat.onScreen[0]).toBe('Вона говорить у кадрі');
  });

  test('a silent cutaway sequence still describes itself, clip by clip', () => {
    const [beat] = flowBeats([
      block({
        id: 'b',
        kind: 'broll',
        clips: [
          { id: 'c1', what: 'Руки гортають блокнот', screenText: 'рік тому' },
          { id: 'c2', what: 'Нарізка з виступу' },
        ],
      }),
    ]);
    expect(beat.saying).toBeNull();
    expect(beat.onScreen).toEqual(['Руки гортають блокнот', 'Нарізка з виступу']);
    expect(beat.screenText).toEqual(['рік тому']);
  });

  test('sound is mentioned only when it differs from the rest of the reel', () => {
    const reel = [
      block({ id: 'a', kind: 'talk', spoken: 'Один' }),
      block({ id: 'b', kind: 'talk', spoken: 'Два', audioSource: 'voiceover' }),
    ];
    const beats = flowBeats(reel, 'trend');
    expect(beats[0].audioDiffers).toBe(false);
    expect(beats[1].audioDiffers).toBe(true);
  });

  test('empty blocks are not beats', () => {
    expect(flowBeats([block({ id: 'a', kind: 'talk' })])).toHaveLength(0);
  });

  test('every beat carries a rough length, so the reel has a shape', () => {
    const [beat] = flowBeats([
      block({ id: 'a', kind: 'talk', spoken: 'одне два три чотири пʼять шість сім вісім девʼять десять' }),
    ]);
    expect(beat.seconds).toBeGreaterThan(0);
  });
});

/**
 * An add-on is «на цих словах вискакує ось це». Whatever "this" is — a link or
 * a pasted picture — has to travel to the person editing, or the instruction
 * describes something they cannot see.
 */
test.describe('what an add-on points at reaches the edit', () => {
  test('an overlay carries its reference', () => {
    const items = editList([
      block({
        id: 'a',
        kind: 'talk',
        spoken: 'Це коштує дорого',
        overlays: [
          overlay({
            id: 'o1',
            anchorText: 'дорого',
            anchorStart: 'Це коштує дорого'.indexOf('дорого'),
            kind: 'image',
            note: 'скріншот цін',
            url: 'https://example.com/prices.png',
          }),
        ],
      }),
    ]);
    expect(items.find((e) => e.slot === 'edit:ov:o1')?.url).toBe('https://example.com/prices.png');
  });

  test('an overlay with nothing attached carries nothing', () => {
    const items = editList([
      block({
        id: 'a',
        kind: 'talk',
        spoken: 'Слова',
        overlays: [overlay({ id: 'o1', anchorText: 'Слова', anchorStart: 0, note: 'зум' })],
      }),
    ]);
    expect(items.find((e) => e.slot === 'edit:ov:o1')?.url).toBeNull();
  });
});

/**
 * Everything typed into a cutaway was stored correctly and then vanished on
 * reload: the column list was hand-copied into three files and only two of them
 * learned about `clips`, so the page's read never asked for the column.
 */
test.describe('the read asks for every column the model has', () => {
  test('REEL_BLOCK_COLUMNS covers every field toReelBlock reads', () => {
    const columns = REEL_BLOCK_COLUMNS.split(',');
    for (const needed of [
      'id',
      'project_id',
      'order_index',
      'kind',
      'speaker',
      'spoken',
      'screen_text',
      'record_note',
      'asset_kind',
      'asset_note',
      'asset_url',
      'edit_note',
      'overlays',
      'clips',
      'images',
      'audio_source',
      'duration_sec',
    ]) {
      expect(columns).toContain(needed);
    }
  });

  test('a row selected with those columns round-trips a clip', () => {
    // The exact shape PostgREST returns for the columns above.
    const row: Record<string, unknown> = {
      id: 'b1',
      project_id: 'p1',
      order_index: 0,
      kind: 'broll',
      clips: [{ id: 'c1', what: 'Зйомка зверху', screenText: '1 рік' }],
      images: [{ id: 'i1', url: 'https://example.com/a.png' }],
    };
    const block = toReelBlock(row);
    expect(block.clips).toHaveLength(1);
    expect(block.images).toHaveLength(1);
    expect(isBlockEmpty(block)).toBe(false);
  });

  test('a block whose ONLY content is clips is not treated as empty', () => {
    const only = block({ id: 'b', kind: 'broll', clips: [{ id: 'c', what: 'Кадр' }] });
    expect(isBlockEmpty(only)).toBe(false);
    expect(shotList([only])).toHaveLength(1);
  });
});
