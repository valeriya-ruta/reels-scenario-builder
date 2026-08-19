/**
 * What the speech model is told before it hears anything.
 *
 * Whisper and the GPT transcribers both take a `prompt` on the transcription
 * endpoint. It is not an instruction the way a chat prompt is — it is fed in as
 * though it were the text immediately preceding the audio, so it biases the
 * decoder's vocabulary and its idea of what kind of text this is. That makes it
 * the one lever that actually moves accuracy on a fixed model.
 *
 * Two jobs here, and both came from a real take of hers coming back wrong:
 *
 * 1. VERBATIM. Left alone, these models tidy: they drop «ееее», merge a false
 *    start into the sentence she abandoned, and smooth a hesitation into a
 *    fluent line she never said. That is the model deciding what she meant, and
 *    it is exactly where the words stopped being hers. Priming with hesitant,
 *    self-interrupting Ukrainian tells it this is speech, not prose. The script
 *    rewrite is what cleans the dump up — it can only do that honestly if the
 *    dump is what was actually said.
 *
 * 2. HER VOCABULARY. Ukrainian speech about Instagram is full of borrowings the
 *    model has barely heard in Ukrainian — рілс, сторіз, хук, контент-план,
 *    охоплення — and it guesses at them, usually into Russian or into a real
 *    Ukrainian word that sounds close. Naming them costs nothing and fixes a
 *    whole class of mistakes at once.
 *
 * Kept well under the 224-token window these endpoints allow: anything past it
 * is silently dropped, and the tail is where the vocabulary sits.
 */

export const DICTATION_LANGUAGE = 'uk';

/**
 * The primer, written AS the kind of text we want back: hesitant spoken
 * Ukrainian, with the domain words spelled the way they should come out.
 *
 * It reads like a fragment of a real dump on purpose. An instruction («записуй
 * дослівно») is just more prose to imitate; a sample of stumbling speech is the
 * thing itself.
 */
export const DICTATION_PRIMER = [
  'Ееее, ну коротше, я тут подумала… тобто, не подумала, а от прям відчула.',
  'Ммм, як це сказати. Короче, я знімаю рілс, і сторіз теж, і в мене є контент-план,',
  'але, ну, він не працює. Ой, ні, працює, але не так. Тобто хук нормальний,',
  'охоплення норм, а от, ееее, збереження — нуль.',
  'Я про це вже казала, здається. Ага. Ну от.',
].join(' ');

/**
 * Everything the transcriber is primed with, for a given language.
 *
 * Only Ukrainian gets the primer: it is written in Ukrainian, and handing
 * Ukrainian text to a model listening to English audio is how you get an
 * English take back in Cyrillic.
 */
export function dictationPrompt(language?: string): string | undefined {
  return language === DICTATION_LANGUAGE ? DICTATION_PRIMER : undefined;
}

// ── stripping the primer back out ────────────────────────────────────────────

/**
 * A primed decoder sometimes hands the primer back.
 *
 * It is fed in as text preceding the audio, so on a quiet passage — the pause
 * before she starts, a segment that caught only breathing — the likeliest
 * continuation IS more of that text, and the model writes it out. That would
 * put sentences into her note that she never said, which is the one thing this
 * whole path exists to prevent.
 *
 * So anything that came from the primer is removed on the way out. Matching is
 * LITERAL — a sentence is dropped only when it appears verbatim in the primer —
 * and short sentences are exempt, because «ну от» and «як це сказати» are
 * things she genuinely says and a loose rule would delete her own words.
 */
const MIN_ECHO_WORDS = 5;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:…«»"'`—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_PRIMER = normalize(DICTATION_PRIMER);

export function isPrimerEcho(sentence: string): boolean {
  const normalized = normalize(sentence);
  if (!normalized) return false;
  if (normalized.split(' ').length < MIN_ECHO_WORDS) return false;
  return NORMALIZED_PRIMER.includes(normalized);
}

/** The transcript with any verbatim run of the primer taken back out. */
export function stripPrimerEcho(text: string): string {
  const kept = text
    // Split on sentence ends but keep them: the transcript is her punctuation
    // and putting it back wrong would change where the rewrite sees a thought.
    .split(/(?<=[.!?…])\s+/)
    .filter((sentence) => !isPrimerEcho(sentence));

  return kept.join(' ').replace(/[ \t]+/g, ' ').trim();
}
