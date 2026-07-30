import { test, expect } from '@playwright/test';
import { reelSignals, decideAutoSave } from '../lib/content/contentKind';
import { opensBraindumpOverlay, contentHref } from '../lib/content/contentPiece';

/**
 * Core-logic specs for two fixes in the autosave/status task (86d3c7u88):
 *   Bug 2 — a reel promotes Ідея→Скрипт when a scene gets authored script text
 *           (`lines`). Raw inputs (name / reference link) stay Ідея.
 *   Bug 3 — any row in the `ideas` table (incl. a promoted idea) reopens the
 *           braindump overlay, never the old dead `/?idea=` route.
 */

test.describe('bug 2 — reel authored-script promotion signals', () => {
  test('reference link alone is a raw input → stays Ідея', () => {
    const s = reelSignals({ name: null, reference_url: 'https://insta/x', reference_note: null }, [
      { lines: null },
    ]);
    expect(s.hasAuthoredWork).toBeFalsy();
    expect(decideAutoSave(s)).toEqual({ save: true, status: 'idea' });
  });

  test('a scene with authored `lines` → promotes to Скрипт', () => {
    const s = reelSignals({ name: 'Мій рілс', reference_url: null, reference_note: null }, [
      { lines: '' },
      { lines: 'Привіт, сьогодні розкажу як...' },
    ]);
    expect(s.hasAuthoredWork).toBe(true);
    expect(decideAutoSave(s)).toEqual({ save: true, status: 'script' });
  });

  test('empty scene lines do not promote', () => {
    const s = reelSignals({ name: null, reference_url: null, reference_note: null }, [
      { lines: '   ' },
    ]);
    expect(s.hasAuthoredWork).toBeFalsy();
    expect(decideAutoSave(s)).toEqual({ save: false });
  });
});

test.describe('bug 3 — idea rows reopen the braindump overlay', () => {
  test('pure idea piece opens the braindump', () => {
    expect(opensBraindumpOverlay({ type: 'idea', refTable: 'ideas' })).toBe(true);
  });

  test('promoted idea (still in ideas table, type flipped) also opens the braindump', () => {
    expect(opensBraindumpOverlay({ type: 'reel', refTable: 'ideas' })).toBe(true);
  });

  test('real content pieces open their editor, not the braindump', () => {
    expect(opensBraindumpOverlay({ type: 'reel', refTable: 'projects' })).toBe(false);
    expect(opensBraindumpOverlay({ type: 'carousel', refTable: 'carousel_projects' })).toBe(false);
    expect(opensBraindumpOverlay({ type: 'story', refTable: 'storytelling_projects' })).toBe(false);
  });

  test('contentHref no longer returns the dead /?idea= route', () => {
    const href = contentHref({ type: 'idea', refTable: 'ideas', id: 'abc' });
    expect(href).not.toContain('?idea=');
    expect(contentHref({ type: 'reel', refTable: 'projects', id: 'p1' })).toBe('/project/p1');
  });
});
