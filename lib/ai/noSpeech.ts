/**
 * Whisper does not stay silent when there is nothing to transcribe.
 *
 * Fed music, ambience or a text-on-screen reel, it emits whatever filled that
 * gap in its training data — YouTube subtitle credits, «Продолжение следует»,
 * "Thanks for watching", `*music*`, or a bare "you". The API reports these as a
 * perfectly successful transcription, so the app stored them as the reel's
 * script and showed «Субтитры сделал DimaTorzok» as if the creator had said it.
 *
 * That is worse than an empty transcript: an empty one is obviously nothing,
 * while a plausible sentence gets read, believed, and templated into a scenario.
 *
 * So: catch it and say the reel has no speech. Pure and import-free — the rules
 * are exactly what the specs check.
 */

/** Thrown when the transcript turns out to be hallucinated filler. */
export const NO_SPEECH_ERROR = 'NO_SPEECH: у відео немає мовлення';

export function isNoSpeechError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.startsWith('NO_SPEECH');
}

/**
 * Phrases that are PROOF of hallucination: a reel's audio does not contain the
 * credits of whatever video Whisper learned them from.
 */
const CREDIT_ARTIFACTS = [
  'субтитры сделал',
  'субтитры делал',
  'субтитры создавал',
  'субтитри зробив',
  'редактор субтитров',
  'корректор субтитров',
  'продолжение следует',
  'subtitles by',
  'subtitled by',
  'subs by',
  'amara.org',
  'transcription outsourcing',
];

/**
 * Filler that CAN be real but is worthless alone — the closing "thank you" of a
 * real reel survives, because it is stripped and then judged on what is left.
 */
const FILLER = [
  'music',
  'muzie',
  'музыка',
  'музика',
  'موسيقى',
  'humming',
  'outro',
  'applause',
  'аплодисменты',
  'thanks for watching',
  'thank you for watching',
  'спасибо за просмотр',
  'дякую за перегляд',
  'подписывайтесь на канал',
  'please subscribe',
  'thank you',
  'thanks',
  'bye',
  'you',
  'so',
  'okay',
  'ok',
];

/** Lowercase, drop punctuation and the `*music*` / ♪ decorations, collapse space. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[*♪♫\[\]()<>«»"'`_—–-]/g, ' ')
    .replace(/[.,!?;:…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A credit artifact damns the whole transcript only when little else is there.
 * A long, real transcript that happens to end «дякую за перегляд» is kept — that
 * is a creator actually saying it.
 */
const CREDIT_CONDEMNS_BELOW_CHARS = 200;

/**
 * Below this, whatever came back is too thin to be a reel's script.
 *
 * Set where it is because of «Who love the sun?» — a real line, sung, from a
 * music-only reel. No phrase list catches lyrics, and a four-word transcript is
 * useless as competitor research whether it was hallucinated or not, so the
 * threshold does the work: nothing of value is lost by calling it no speech.
 * (`no_speech_prob` catches these properly when the provider returns it.)
 */
const MIN_MEANINGFUL_CHARS = 20;
const MIN_MEANINGFUL_WORDS = 5;

export function isNoSpeechTranscript(transcript: string | null | undefined): boolean {
  const raw = (transcript ?? '').trim();
  if (!raw) return true;

  const normalized = normalize(raw);
  if (!normalized) return true;

  const hasCredit = CREDIT_ARTIFACTS.some((a) => normalized.includes(a));
  if (hasCredit && raw.length < CREDIT_CONDEMNS_BELOW_CHARS) return true;

  // Strip the filler, then judge what is actually left.
  let remainder = normalized;
  for (const phrase of CREDIT_ARTIFACTS) remainder = remainder.split(phrase).join(' ');
  for (const phrase of FILLER) {
    remainder = remainder.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'g'), ' ');
  }
  // A hallucinated credit trails a name — drop the leftovers of it.
  remainder = remainder.replace(/\s+/g, ' ').trim();

  if (hasCredit) {
    // What survived a credit line has to stand on its own to be believed.
    const words = remainder.split(' ').filter(Boolean);
    if (words.length < MIN_MEANINGFUL_WORDS * 2) return true;
  }

  if (remainder.length < MIN_MEANINGFUL_CHARS) return true;
  if (remainder.split(' ').filter(Boolean).length < MIN_MEANINGFUL_WORDS) return true;

  // «Thank you. Thank you. Thank you. Thank you.» — one phrase on a loop is the
  // model idling, not someone talking.
  const sentences = raw
    .split(/[.!?\n]+/)
    .map((s) => normalize(s))
    .filter(Boolean);
  if (sentences.length >= 3) {
    const unique = new Set(sentences);
    if (unique.size <= Math.max(1, Math.floor(sentences.length / 3))) return true;
  }

  return false;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whisper's own verdict, when the provider returns it. `no_speech_prob` per
 * segment is the model saying "I heard nothing here" — far better evidence than
 * any phrase list, and it catches sung lyrics, which no blocklist can.
 */
export function segmentsSayNoSpeech(
  segments: ReadonlyArray<{ noSpeechProb?: number | null }>,
): boolean {
  const scored = segments.filter((s) => typeof s.noSpeechProb === 'number');
  if (scored.length === 0) return false;
  return scored.every((s) => (s.noSpeechProb ?? 0) >= 0.6);
}
