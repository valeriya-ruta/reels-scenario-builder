import { test, expect } from '@playwright/test';
import { cleanScript, hasScript, scriptWordCount } from '@/lib/reels/script';
import { emptyBlock, type ReelBlock } from '@/lib/reels/blocks';

/**
 * «Скопіювати весь текст» is the app's whole handoff to the camera: the script
 * leaves here and is pasted into Instagram Edits. So the thing under test is
 * not "does it produce a script" but "is it the SAME string she typed" —
 * paragraph breaks and all, with nothing added.
 */

function talk(spoken: string | null, i = 0): ReelBlock {
  return { ...emptyBlock('talk', 'p1', i, `b${i}`), spoken };
}

test('a yap comes back byte-for-byte, paragraph breaks included', () => {
  const typed =
    'Я мріяла про життя, де встигаю все — і не працюю до смерті.\n\n' +
    'Виявилось, річ не в дисципліні. Річ у дванадцяти тижнях замість цілого року.\n\n' +
    'Рік — це дозвіл відкласти. Дванадцять тижнів — ні.';

  expect(cleanScript([talk(typed)])).toBe(typed);
});

test('single newlines inside a block survive — she chose that break', () => {
  const typed = 'перший рядок\nдругий рядок\n\nновий абзац';
  expect(cleanScript([talk(typed)])).toBe(typed);
});

test('scenes join with a blank line and nothing else', () => {
  const blocks = [talk('Перша сцена.', 0), talk('Друга сцена.', 1), talk('Третя.', 2)];
  expect(cleanScript(blocks)).toBe('Перша сцена.\n\nДруга сцена.\n\nТретя.');
});

test('no numbering, no labels, no speaker prefixes reach the clipboard', () => {
  const dialogue: ReelBlock = {
    ...emptyBlock('dialogue', 'p1', 0, 'b0'),
    speaker: 'Мама',
    spoken: 'А ти вже поїла?',
  };
  const out = cleanScript([dialogue, talk('Поїла.', 1)]);

  expect(out).toBe('А ти вже поїла?\n\nПоїла.');
  expect(out).not.toContain('Мама');
  expect(out).not.toMatch(/^\d/m);
  expect(out).not.toContain('Сцена');
});

test('captions never leak into the script — they are not said out loud', () => {
  const caption: ReelBlock = {
    ...emptyBlock('text', 'p1', 1, 'b1'),
    screenText: '12 тижнів = 1 рік',
  };
  const out = cleanScript([talk('Річ у дванадцяти тижнях.', 0), caption]);

  expect(out).toBe('Річ у дванадцяти тижнях.');
  expect(out).not.toContain('12 тижнів');
});

test('empty and whitespace-only blocks leave no gap behind them', () => {
  const blocks = [talk('Перша.', 0), talk('   \n  ', 1), talk(null, 2), talk('Друга.', 3)];
  expect(cleanScript(blocks)).toBe('Перша.\n\nДруга.');
});

test('leading and trailing whitespace is the only thing trimmed', () => {
  expect(cleanScript([talk('\n\n  Текст.  \n\n')])).toBe('Текст.');
});

test('a wordless trend reel has no script rather than an empty one', () => {
  const clip: ReelBlock = {
    ...emptyBlock('broll', 'p1', 0, 'b0'),
    clips: [{ id: 'c1', what: 'Мем із котом', screenText: 'коли понеділок' }],
  };

  expect(hasScript([clip])).toBe(false);
  expect(cleanScript([clip])).toBe('');
});

test('word count reads the script, not the captions around it', () => {
  const caption: ReelBlock = { ...emptyBlock('text', 'p1', 1, 'b1'), screenText: 'один два три' };
  expect(scriptWordCount([talk('чотири слова тут рівно', 0), caption])).toBe(4);
});
