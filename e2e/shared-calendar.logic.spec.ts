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

  test('a reel tells the client what to DO, block by block', () => {
    const detail = toSharedDetail({
      kind: 'reel',
      id: 'r1',
      title: 'Рілс про ціни',
      scheduledDate: '2026-08-19',
      blocks: [
        {
          blockKind: 'talk',
          spoken: 'Скільки це коштує?',
          recordNote: 'крупний план',
          overlays: [{ anchorText: 'коштує', kind: 'image', note: 'скріншот цін' }],
        },
        { blockKind: 'dialogue', speaker: 'Вона', spoken: 'Дорого.' },
        {
          blockKind: 'broll',
          assetKind: 'find',
          assetNote: 'архівне відео',
          audioSource: 'voiceover',
        },
      ],
    });

    // A talking block: the words are the body, the doing is the meta.
    expect(detail?.blocks[0].heading).toBe('Говорю в камеру');
    expect(detail?.blocks[0].body).toBe('Скільки це коштує?');
    expect(detail?.blocks[0].meta).toContain('Знімаємо: крупний план');
    expect(detail?.blocks[0].meta).toContain('На «коштує» — Фото: скріншот цін');

    // Dialogue is headed by whoever says it.
    expect(detail?.blocks[1].heading).toBe('Вона');

    // An asset states the ACTION first — the client's first question.
    expect(detail?.blocks[2].heading).toBe('Знайти: архівне відео');
    expect(detail?.blocks[2].meta).toContain('Голос поверх');

    expect(detail?.countLabel).toBe('3 сцени');
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
