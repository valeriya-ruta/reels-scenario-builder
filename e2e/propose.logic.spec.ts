import { test, expect } from '@playwright/test';
import { ageInDays, buildSignals, excerpt } from '@/lib/propose/signals';
import { daysUk, fallbackProposals, COLD_START_PROPOSALS } from '@/lib/propose/fallback';
import { normalizeProposals, buildUserContent } from '@/lib/propose/proposeAngles';
import { PROPOSAL_COUNT } from '@/lib/propose/types';

/**
 * The proposal system's one non-negotiable: a creation entry point NEVER renders
 * a blank prompt. That means `fallbackProposals` must return a full, usable set
 * for every input — including no input at all — and every proposal that reaches
 * a screen must carry a rationale.
 */

const TODAY = '2026-07-31T10:00:00.000Z';

test.describe('propose — signals', () => {
  test('ages are whole days and never negative', () => {
    expect(ageInDays('2026-07-28T10:00:00.000Z', TODAY)).toBe(3);
    expect(ageInDays('2026-07-31T09:00:00.000Z', TODAY)).toBe(0);
    // A future timestamp (clock skew) must not produce "-2 днів" in a rationale.
    expect(ageInDays('2026-08-02T10:00:00.000Z', TODAY)).toBe(0);
  });

  test('excerpt collapses whitespace and cuts on a word boundary', () => {
    expect(excerpt('  дві   строки\nтексту  ')).toBe('дві строки тексту');
    const long = excerpt('а'.repeat(200), 20);
    expect(long.length).toBeLessThanOrEqual(21);
    expect(long.endsWith('…')).toBe(true);
  });

  test('published pieces lead, then unused dumps, then staleness', () => {
    const signals = buildSignals(
      {
        pieces: [
          {
            id: 'p1',
            title: 'Стара чернетка',
            type: 'reels',
            status: 'script',
            scheduledDate: null,
            updatedAt: '2026-07-20T10:00:00.000Z',
          },
          {
            id: 'p2',
            title: 'Опублікований рілс',
            type: 'reels',
            status: 'published',
            scheduledDate: '2026-07-29',
            updatedAt: '2026-07-29T10:00:00.000Z',
          },
        ],
        ideas: [
          { id: 'i1', content: 'думка без продовження', createdAt: '2026-07-25T10:00:00.000Z', childCount: 0 },
          { id: 'i2', content: 'вже використана', createdAt: '2026-07-26T10:00:00.000Z', childCount: 2 },
        ],
      },
      TODAY,
    );

    expect(signals.map((s) => s.kind)).toEqual(['proven', 'unused-dump', 'stale']);
    // A dump that already produced content is not evidence of anything unused.
    expect(signals.some((s) => s.label.includes('вже використана'))).toBe(false);
  });

  test('a piece undated for under 3 days is work in flight, not staleness', () => {
    const signals = buildSignals(
      {
        pieces: [
          {
            id: 'p1',
            title: 'Вчорашнє',
            type: 'carousel',
            status: 'design',
            scheduledDate: null,
            updatedAt: '2026-07-30T10:00:00.000Z',
          },
        ],
        ideas: [],
      },
      TODAY,
    );
    expect(signals).toEqual([]);
  });
});

test.describe('propose — fallback', () => {
  test('returns a full set even with no signals at all', () => {
    const proposals = fallbackProposals([]);
    expect(proposals).toHaveLength(PROPOSAL_COUNT);
    expect(proposals.every((p) => p.title.length > 0)).toBe(true);
  });

  test('every proposal carries a rationale — that line is the product', () => {
    const signals = buildSignals(
      {
        pieces: [
          {
            id: 'p1',
            title: 'Опублікований рілс',
            type: 'reels',
            status: 'published',
            scheduledDate: '2026-07-29',
            updatedAt: '2026-07-29T10:00:00.000Z',
          },
        ],
        ideas: [{ id: 'i1', content: 'сира думка', createdAt: '2026-07-24T10:00:00.000Z', childCount: 0 }],
      },
      TODAY,
    );
    for (const proposal of fallbackProposals(signals)) {
      expect(proposal.rationale.trim().length).toBeGreaterThan(0);
      expect(proposal.seed.trim().length).toBeGreaterThan(0);
    }
  });

  test('does not stack three cards of the same shape', () => {
    const signals = buildSignals(
      {
        pieces: [],
        ideas: [
          { id: 'a', content: 'перша', createdAt: '2026-07-24T10:00:00.000Z', childCount: 0 },
          { id: 'b', content: 'друга', createdAt: '2026-07-25T10:00:00.000Z', childCount: 0 },
          { id: 'c', content: 'третя', createdAt: '2026-07-26T10:00:00.000Z', childCount: 0 },
        ],
      },
      TODAY,
    );
    const kinds = fallbackProposals(signals).map((p) => p.source);
    expect(kinds.filter((k) => k === 'unused-dump')).toHaveLength(1);
  });

  test('cold-start angles are directions, not questions back to the user', () => {
    for (const proposal of COLD_START_PROPOSALS) {
      expect(proposal.title.includes('?')).toBe(false);
    }
  });

  test('day plurals are correct Ukrainian', () => {
    expect(daysUk(1)).toBe('1 день');
    expect(daysUk(3)).toBe('3 дні');
    expect(daysUk(5)).toBe('5 днів');
    expect(daysUk(11)).toBe('11 днів');
    expect(daysUk(21)).toBe('21 день');
    expect(daysUk(22)).toBe('22 дні');
  });
});

test.describe('propose — model output normalization', () => {
  test('drops proposals missing a rationale rather than rendering a bare button', () => {
    const out = normalizeProposals({
      proposals: [
        { title: 'З рационале', rationale: 'бо спрацювало', seed: 'сід', type: 'reels' },
        { title: 'Без рационале', seed: 'сід' },
        { rationale: 'без заголовка' },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].suggestedType).toBe('reels');
  });

  test('falls back to the title as the seed, and rejects unknown types', () => {
    const out = normalizeProposals({
      proposals: [{ title: 'Кут', rationale: 'бо', type: 'podcast' }],
    });
    expect(out[0].seed).toBe('Кут');
    expect(out[0].suggestedType).toBeNull();
  });

  test('survives junk shapes without throwing', () => {
    expect(normalizeProposals(null)).toEqual([]);
    expect(normalizeProposals({ proposals: 'nope' })).toEqual([]);
    expect(normalizeProposals({})).toEqual([]);
  });

  test('an empty signal set still produces a usable prompt', () => {
    expect(buildUserContent([]).length).toBeGreaterThan(0);
    expect(buildUserContent([{ kind: 'proven', label: 'Тест', ageDays: 2, type: 'reels' }])).toContain(
      'ОПУБЛІКОВАНО',
    );
  });
});
