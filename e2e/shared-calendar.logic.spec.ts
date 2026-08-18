import { test, expect } from '@playwright/test';
import {
  countLabelFor,
  isShareableRefTable,
  toSharedDetail,
  toSharedPieces,
} from '@/lib/calendar/sharedCalendar';

/**
 * The shared (client-facing) calendar reads through two database functions and
 * renders whatever they hand back, so these pin the seam between them: which
 * rows become calendar entries, which do not, and how a piece's body becomes the
 * one block shape the detail view knows how to render.
 */

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  content_type: 'story',
  status: 'film',
  title: 'Злам року',
  ref_table: 'storytelling_projects',
  scheduled_date: '2026-08-18',
  set_index: null,
  set_size: null,
  ...over,
});

test.describe('shared calendar — rows → pieces', () => {
  test('keeps dated pieces and drops anything not shareable', () => {
    const pieces = toSharedPieces([
      row(),
      row({ id: 'p2', ref_table: 'ideas', content_type: 'idea' }),
      row({ id: 'p3', scheduled_date: null }),
    ]);
    expect(pieces.map((p) => p.id)).toEqual(['p1']);
  });

  test('status never reaches the client, even though the row carries it', () => {
    const [piece] = toSharedPieces([row({ status: 'film' })]);
    expect('status' in piece).toBe(false);
    expect(JSON.stringify(piece)).not.toContain('film');
  });

  test('normalizes a timestamp down to the day key the grid buckets on', () => {
    const [piece] = toSharedPieces([row({ scheduled_date: '2026-08-18T00:00:00.000Z' })]);
    expect(piece.scheduledDate).toBe('2026-08-18');
  });

  test('a set reads in day order inside its day', () => {
    const pieces = toSharedPieces([
      row({ id: 'b', set_index: 2, set_size: 3, title: 'б' }),
      row({ id: 'a', set_index: 1, set_size: 3, title: 'а' }),
      row({ id: 'c', set_index: 3, set_size: 3, title: 'в' }),
    ]);
    expect(pieces.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  test('days sort ascending across the month', () => {
    const pieces = toSharedPieces([
      row({ id: 'later', scheduled_date: '2026-08-20' }),
      row({ id: 'earlier', scheduled_date: '2026-08-02' }),
    ]);
    expect(pieces.map((p) => p.id)).toEqual(['earlier', 'later']);
  });

  test('only the three content tables can be opened through a share link', () => {
    expect(isShareableRefTable('projects')).toBe(true);
    expect(isShareableRefTable('carousel_projects')).toBe(true);
    expect(isShareableRefTable('storytelling_projects')).toBe(true);
    // An idea has no date it is committed to, and nothing else is a content row.
    expect(isShareableRefTable('ideas')).toBe(false);
    expect(isShareableRefTable('profiles')).toBe(false);
    expect(isShareableRefTable(undefined)).toBe(false);
  });
});

test.describe('shared calendar — piece → detail blocks', () => {
  test('a storytelling becomes numbered stories with their production notes', () => {
    const detail = toSharedDetail({
      kind: 'story',
      id: 's1',
      title: 'Злам року',
      status: 'film',
      scheduledDate: '2026-08-18',
      blocks: [
        { text: 'Я зупинилась.', visual: 'Говоряща голова', engagement: 'Опитування' },
        { text: '', visual: null, engagement: null },
      ],
    });
    expect(detail?.type).toBe('story');
    expect(detail?.countLabel).toBe('2 сторіс');
    // The creator's production state is not the client's business, and dropping
    // it here keeps it out of the page's data, not merely off the screen.
    expect('status' in (detail as object)).toBe(false);
    expect(detail?.blocks[0]).toEqual({
      heading: 'Сторіс 1',
      body: 'Я зупинилась.',
      meta: ['Візуал: Говоряща голова', 'Інтерактив: Опитування'],
    });
    // A card that is still blank keeps its slot — the client sees the shape.
    expect(detail?.blocks[1].body).toBe('');
    expect(detail?.blocks[1].meta).toEqual([]);
  });

  test('a reel arrives whole, in the shape the builder uses', () => {
    const detail = toSharedDetail({
      kind: 'reel',
      id: 'r1',
      title: 'Рілс про ціни',
      scheduledDate: '2026-08-19',
      overview: 'Про те, як ми рахуємо ціну',
      reelAudio: 'trend',
      references: [{ id: 'ref_1', url: 'https://www.instagram.com/p/ABC/' }],
      blocks: [
        {
          id: 'b1',
          project_id: 'r1',
          order_index: 0,
          kind: 'talk',
          spoken: 'Скільки це коштує?',
          record_note: 'крупний план',
          overlays: [{ id: 'o1', anchorText: 'коштує', kind: 'image', note: 'скріншот цін' }],
        },
        {
          id: 'b2',
          project_id: 'r1',
          order_index: 1,
          kind: 'broll',
          clips: [{ id: 'c1', what: 'архівне відео', assetKind: 'find', screenText: 'дорого' }],
        },
      ],
    });

    // Not paraphrased into headings: the real blocks, parsed by the one parser.
    expect(detail?.blocks).toEqual([]);
    expect(detail?.reel?.blocks).toHaveLength(2);
    expect(detail?.reel?.blocks[0].spoken).toBe('Скільки це коштує?');
    expect(detail?.reel?.blocks[0].recordNote).toBe('крупний план');
    expect(detail?.reel?.blocks[0].overlays[0]).toMatchObject({ note: 'скріншот цін' });

    // The clips are the whole point: a video-only reel used to arrive blank.
    expect(detail?.reel?.blocks[1].clips[0].what).toBe('архівне відео');
    expect(detail?.reel?.blocks[1].clips[0].screenText).toBe('дорого');

    // And the reel-level context, which the calendar never carried at all.
    expect(detail?.reel?.overview).toBe('Про те, як ми рахуємо ціну');
    expect(detail?.reel?.audio).toBe('trend');
    expect(detail?.reel?.references).toHaveLength(1);

    expect(detail?.countLabel).toBe('2 сцени');
  });

  test('a reel with nothing set keeps its shape rather than failing', () => {
    const detail = toSharedDetail({ kind: 'reel', id: 'r2', title: 'Порожній', blocks: [] });
    expect(detail?.reel).toEqual({ blocks: [], overview: null, audio: null, references: [] });
    expect(detail?.countLabel).toBe('0 сцен');
  });

  test('an unknown reel sound is dropped rather than rendered as a label', () => {
    const detail = toSharedDetail({
      kind: 'reel',
      id: 'r3',
      title: 'Рілс',
      reelAudio: 'not-a-source',
      blocks: [],
    });
    expect(detail?.reel?.audio).toBeNull();
  });

  test('only a reel carries the reel payload', () => {
    const story = toSharedDetail({ kind: 'story', id: 's1', title: 'С', blocks: [] });
    expect(story?.reel).toBeUndefined();
  });

  test('a carousel becomes its slides, titled or numbered', () => {
    const detail = toSharedDetail({
      kind: 'carousel',
      id: 'c1',
      title: 'Карусель',
      status: 'design',
      scheduledDate: '2026-08-20',
      blocks: [{ title: 'Обкладинка', body: 'Три помилки' }, { title: '', body: 'Перша' }],
    });
    expect(detail?.blocks.map((b) => b.heading)).toEqual(['Обкладинка', 'Слайд 2']);
    expect(detail?.countLabel).toBe('2 слайди');
  });

  test('an unresolvable token / unknown piece yields nothing to render', () => {
    expect(toSharedDetail(null)).toBeNull();
    expect(toSharedDetail({ kind: 'something-else' })).toBeNull();
    // A piece with no body is still a piece: it renders empty, it does not fail.
    expect(toSharedDetail({ kind: 'story', id: 's', title: 't', blocks: null })?.blocks).toEqual([]);
  });

  test('counts read in the format’s own noun, with Ukrainian plurals', () => {
    expect(countLabelFor('carousel', 1)).toBe('1 слайд');
    expect(countLabelFor('carousel', 3)).toBe('3 слайди');
    expect(countLabelFor('carousel', 8)).toBe('8 слайдів');
    expect(countLabelFor('reel', 1)).toBe('1 сцена');
    expect(countLabelFor('reel', 11)).toBe('11 сцен');
    expect(countLabelFor('story', 5)).toBe('5 сторіс');
  });
});
