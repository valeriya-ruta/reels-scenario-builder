import { test, expect } from '@playwright/test';
import {
  planDeck,
  rankBacklog,
  growsBacklog,
  DECK_MIN,
  DECK_MAX,
  BACKLOG_FULL,
  type BacklogIdea,
} from '@/lib/ideas/deckPolicy';

/**
 * Prompt 6's one rule: the deck must REDUCE the backlog, never grow it.
 * Generating fresh ideas on top of an unexecuted pile is the failure mode.
 */

const idea = (id: string, ageDays: number, proven = false): BacklogIdea => ({
  id,
  text: `idea ${id}`,
  ageDays,
  proven,
});

test.describe('deck population', () => {
  test('empty backlog → generate a full deck', () => {
    const plan = planDeck([]);
    expect(plan.mode).toBe('generate');
    expect(plan.generateCount).toBe(DECK_MAX);
    expect(plan.resurface).toEqual([]);
  });

  test('full backlog → resurface only, generate NOTHING', () => {
    const backlog = Array.from({ length: BACKLOG_FULL + 5 }, (_, i) => idea(`i${i}`, i));
    const plan = planDeck(backlog);
    expect(plan.mode).toBe('resurface');
    expect(plan.generateCount).toBe(0);
    expect(plan.resurface).toHaveLength(DECK_MAX);
    expect(growsBacklog(plan, backlog.length)).toBe(false);
  });

  test('partial backlog → every existing idea gets a slot, new ones fill the rest', () => {
    const backlog = [idea('a', 3), idea('b', 9), idea('c', 1)];
    const plan = planDeck(backlog);
    expect(plan.mode).toBe('mix');
    expect(plan.resurface).toHaveLength(3);
    expect(plan.generateCount).toBe(DECK_MAX - 3);
    expect(plan.resurface.length + plan.generateCount).toBe(DECK_MAX);
  });

  test('the deck never grows the pile, at any backlog size', () => {
    for (let n = 0; n <= BACKLOG_FULL + 3; n++) {
      const backlog = Array.from({ length: n }, (_, i) => idea(`i${i}`, i));
      expect(growsBacklog(planDeck(backlog), n)).toBe(false);
    }
  });

  test('deck size is clamped to the 5–10 band', () => {
    expect(planDeck([], 99).generateCount).toBe(DECK_MAX);
    expect(planDeck([], 1).generateCount).toBe(DECK_MIN);
  });
});

test.describe('quality decides the front of the deck', () => {
  test('a proven idea jumps the queue, however new it is', () => {
    const ranked = rankBacklog([idea('old', 40), idea('fresh-winner', 0, true), idea('mid', 10)]);
    expect(ranked[0].id).toBe('fresh-winner');
  });

  test('without a proven signal, the oldest goes first — most at risk of never being made', () => {
    const ranked = rankBacklog([idea('new', 1), idea('ancient', 60), idea('mid', 20)]);
    expect(ranked.map((i) => i.id)).toEqual(['ancient', 'mid', 'new']);
  });

  test('several proven ideas keep age order among themselves', () => {
    const ranked = rankBacklog([idea('w-new', 2, true), idea('w-old', 30, true), idea('plain', 50)]);
    expect(ranked.map((i) => i.id)).toEqual(['w-old', 'w-new', 'plain']);
  });

  test('ranking does not mutate its input', () => {
    const input = [idea('a', 1), idea('b', 9)];
    rankBacklog(input);
    expect(input.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
