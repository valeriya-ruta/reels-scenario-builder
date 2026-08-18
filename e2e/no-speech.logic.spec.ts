import { test, expect } from '@playwright/test';
import { isNoSpeechTranscript, segmentsSayNoSpeech } from '@/lib/ai/noSpeech';

/**
 * Every string in the first block is REAL output this app stored as a competitor
 * reel's script, marked `transcript_status: success`. Whisper produced them for
 * videos with no speech — music, ambience, text on screen — because it answers
 * whether or not anyone spoke.
 */
test.describe('hallucinated transcripts are not transcripts', () => {
  const REAL_GARBAGE = [
    'Мы остаемся близки.  Люблю тебя.  Субтитры сделал DimaTorzok',
    '-',
    'you',
    'موسيقى',
    '*music*',
    '*MUZIE*',
    '*outro music*',
    '*music*  *music*',
    'So,  Thank you.',
    'Thank you.  Thank you.  Thank you.  Thank you.',
    'Who love the sun?',
  ];

  for (const text of REAL_GARBAGE) {
    test(`caught: ${JSON.stringify(text.slice(0, 42))}`, () => {
      expect(isNoSpeechTranscript(text)).toBe(true);
    });
  }

  test('nothing at all is nothing', () => {
    expect(isNoSpeechTranscript('')).toBe(true);
    expect(isNoSpeechTranscript('   ')).toBe(true);
    expect(isNoSpeechTranscript(null)).toBe(true);
  });
});

test.describe('real speech survives', () => {
  test('an actual reel script is kept', () => {
    const real =
      'Я мрію, щоб цей рілс побачила кожна дівчина, яка мріє про життя, де вона ' +
      'досягає усіх своїх цілей, але при цьому не працює до смерті. 12 тижнів — ' +
      'це все, що тобі потрібно.';
    expect(isNoSpeechTranscript(real)).toBe(false);
  });

  test('a short but real line is kept', () => {
    expect(isNoSpeechTranscript('Пиши цифру 12 або шукай посилання в шапці профіля')).toBe(false);
  });

  test('a creator really saying "дякую за перегляд" at the end keeps their script', () => {
    // The phrase is filler on its own and proof of nothing in a full transcript —
    // condemning this would delete a real reel's words.
    const real =
      'Сьогодні розкажу, як я планую контент на місяць вперед і чому це займає ' +
      'у мене дві години замість двох тижнів. Спочатку я виписую всі ідеї, потім ' +
      'групую їх по темах, і вже тоді ставлю дати у календар. Дякую за перегляд!';
    expect(isNoSpeechTranscript(real)).toBe(false);
  });

  test('repetition inside real speech is not a loop', () => {
    const real =
      'Це працює. І це теж працює. А ось це вже не працює, і зараз поясню чому ' +
      'саме так стається з більшістю блогерів на старті.';
    expect(isNoSpeechTranscript(real)).toBe(false);
  });
});

test.describe("Whisper's own no-speech score", () => {
  test('every segment silent means silent — this is what catches sung lyrics', () => {
    expect(segmentsSayNoSpeech([{ noSpeechProb: 0.95 }, { noSpeechProb: 0.8 }])).toBe(true);
  });

  test('one confident segment is enough to believe there was speech', () => {
    expect(segmentsSayNoSpeech([{ noSpeechProb: 0.95 }, { noSpeechProb: 0.02 }])).toBe(false);
  });

  test('a provider that omits the score decides nothing', () => {
    expect(segmentsSayNoSpeech([{}, {}])).toBe(false);
    expect(segmentsSayNoSpeech([])).toBe(false);
  });
});
