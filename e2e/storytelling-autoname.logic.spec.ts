import { test, expect } from '@playwright/test';
import { deriveStorytellingName, isUnnamedStorytelling } from '@/lib/storytelling/autoName';
import { displayTitle, isPlaceholderTitle, NEW_LABELS } from '@/lib/content/displayTitle';

/**
 * An unnamed storytelling names itself after its opening line, so a week of
 * them stops reading as four identical «Нова історія» rows in Сьогодні / План.
 *
 * The two rules that make it safe: never overwrite a name a person chose, and
 * stay quiet until there is a real sentence to take.
 */

test.describe('what becomes the name', () => {
  test('the opening sentence, without its full stop', () => {
    expect(deriveStorytellingName('Я три роки будувала те, що мене вбивало.')).toBe(
      'Я три роки будувала те, що мене вбивало',
    );
  });

  test('only the FIRST sentence — the rest of the card is not a title', () => {
    expect(
      deriveStorytellingName('Я нарешті зупинилась. І аж тоді почалося найцікавіше.'),
    ).toBe('Я нарешті зупинилась');
  });

  test('a line break ends a thought as surely as a full stop', () => {
    expect(deriveStorytellingName('Мій найдорожчий провал\nа далі буде більше')).toBe(
      'Мій найдорожчий провал',
    );
  });

  test("the engine's «Нотатка:» tail is production instruction, never the name", () => {
    expect(
      deriveStorytellingName('Як я втратила клієнта на 2000$\n\nНотатка: зняти на телефон'),
    ).toBe('Як я втратила клієнта на 2000$');
  });

  test('inline *placeholders* keep their words and lose their stars', () => {
    expect(deriveStorytellingName('Сьогодні розкажу про *назва курсу* чесно')).toBe(
      'Сьогодні розкажу про назва курсу чесно',
    );
  });

  test('a question keeps its question mark — that is the author speaking', () => {
    expect(deriveStorytellingName('Чому я більше не веду блог щодня?')).toBe(
      'Чому я більше не веду блог щодня?',
    );
  });

  test('a long opening is clipped at a word boundary, never mid-word', () => {
    const long =
      'Я довго не наважувалась розповісти цю історію бо думала що вона нікому не буде цікава';
    const name = deriveStorytellingName(long) ?? '';
    expect(name.length).toBeLessThanOrEqual(61); // 60 + the ellipsis
    expect(name.endsWith('…')).toBe(true);
    expect(long.startsWith(name.slice(0, -1))).toBe(true);
    // The clip lands on a space in the source, i.e. no half word survives.
    expect(long[name.length - 1] === ' ' || long[name.length - 1] === undefined).toBe(true);
  });

  test('leading quotes and dashes are trimmed off the front', () => {
    expect(deriveStorytellingName('— «Ти не витягнеш», сказали мені')).toBe(
      'Ти не витягнеш», сказали мені',
    );
  });
});

test.describe('when it stays quiet', () => {
  test('an empty card names nothing', () => {
    expect(deriveStorytellingName('')).toBeNull();
    expect(deriveStorytellingName(null)).toBeNull();
    expect(deriveStorytellingName('   \n  ')).toBeNull();
  });

  test('half a typed word is not a title', () => {
    expect(deriveStorytellingName('Я тр')).toBeNull();
  });

  test('too few words, however long, is not a title', () => {
    expect(deriveStorytellingName('Привітання')).toBeNull();
  });

  test('a card that is only a note yields nothing', () => {
    expect(deriveStorytellingName('\nНотатка: зняти вертикально')).toBeNull();
  });

  test('the threshold is a real sentence, not a fragment', () => {
    // Three words and twelve characters is the floor.
    expect(deriveStorytellingName('я вже все')).toBeNull();
    expect(deriveStorytellingName('я вже все зрозуміла')).toBe('я вже все зрозуміла');
  });
});

test.describe('what counts as never named', () => {
  test('the label written at creation means nobody has named it', () => {
    expect(isUnnamedStorytelling(NEW_LABELS.story)).toBe(true);
    expect(isUnnamedStorytelling('  нова   ІСТОРІЯ ')).toBe(true);
    // The older placeholders still count.
    expect(isUnnamedStorytelling('Без назви')).toBe(true);
    expect(isUnnamedStorytelling('')).toBe(true);
    expect(isUnnamedStorytelling(null)).toBe(true);
  });

  test('a name someone chose is left alone — including one that merely starts like the label', () => {
    expect(isUnnamedStorytelling('Злам року')).toBe(false);
    expect(isUnnamedStorytelling('Нова історія про клієнта')).toBe(false);
  });

  test('the shared placeholder rule is deliberately NOT widened', () => {
    // `displayTitle` substitutes «Нова історія» for an empty name, so that label
    // must keep reading as a real title there or the fallback stops being stable
    // under re-read. "Never named" is a different question, asked separately.
    expect(isPlaceholderTitle(NEW_LABELS.story)).toBe(false);
    expect(displayTitle(NEW_LABELS.story, 'story')).toBe(NEW_LABELS.story);
    expect(displayTitle('', 'story')).toBe(NEW_LABELS.story);
    expect(displayTitle('Злам року', 'story')).toBe('Злам року');
  });
});
