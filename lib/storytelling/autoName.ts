/**
 * Name a storytelling after what it actually says (pure).
 *
 * Every manually created storytelling is written to the database as «Нова
 * історія» — the type-appropriate stand-in for "never named" (see
 * `displayTitle`). That is fine inside the editor, where the cards are on
 * screen, and useless everywhere else: Сьогодні, План and Контент end up
 * listing four identical rows and you cannot tell which is the one you meant.
 *
 * So the moment a story has enough written in it to be about something, its
 * opening line becomes its name. The opening line is the right source — it is
 * already what the list card previews, and it is the sentence the user will
 * read to camera, so it names the piece the way its author would.
 *
 * Two rules keep it honest:
 *   • it only ever fills a placeholder — a name the user typed is never touched;
 *   • it stays quiet until there is a real sentence, so a title is never «Я тр».
 */

import { isPlaceholderTitle, NEW_LABELS } from '@/lib/content/displayTitle';

/**
 * Whether this storytelling has never been named by a person.
 *
 * Deliberately NOT folded into the shared `isPlaceholderTitle`: that predicate
 * answers "should the screen substitute a fallback?", and «Нова історія» is
 * already that fallback — it must keep reading as a real title there, or
 * `displayTitle` would stop being stable under re-read.
 *
 * This asks a different question: "is this row still carrying the name the app
 * gave it at creation?" Rule 1 of `displayTitle` writes that label INTO the row,
 * so a storytelling still called «Нова історія» has been named by nobody, and
 * auto-naming may fill it. Anything else is someone's choice and is left alone.
 */
export function isUnnamedStorytelling(name: string | null | undefined): boolean {
  if (isPlaceholderTitle(name)) return true;
  const normalized = (name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return normalized === NEW_LABELS.story.toLowerCase();
}

/** Below this there is nothing to name yet. */
const MIN_WORDS = 3;
const MIN_CHARS = 12;
/** Long enough to identify the piece in a list, short enough to read at a glance. */
const MAX_LEN = 60;

/**
 * The stored card text carries an optional director's note the engine appends
 * as «Нотатка: …». That is production instruction, not what the story says.
 */
function stripNote(text: string): string {
  return text.split(/\n\s*Нотатка:/)[0] ?? '';
}

/**
 * The engine writes honest placeholders inline as `*тут назва курсу*`. The stars
 * are markup — the words inside are still what the sentence is about.
 */
function stripPlaceholderMarks(text: string): string {
  return text.replace(/\*+/g, '');
}

function firstSentence(text: string): string {
  // A hard line break ends a thought as surely as a full stop does.
  const line = text.split(/\n/).map((l) => l.trim()).find(Boolean) ?? '';
  const match = line.match(/^[^.!?…]+[.!?…]?/);
  return (match?.[0] ?? line).trim();
}

/** Trim the punctuation a clipped sentence leaves dangling. */
function tidy(text: string): string {
  return text
    .replace(/^[\s"'«»„“(\[—–-]+/, '')
    .replace(/[\s,;:—–-]+$/, '')
    .trim();
}

function clip(text: string): string {
  if (text.length <= MAX_LEN) return text;
  const cut = text.slice(0, MAX_LEN);
  const boundary = cut.lastIndexOf(' ');
  const stem = tidy(boundary > MAX_LEN / 2 ? cut.slice(0, boundary) : cut);
  return `${stem}…`;
}

/**
 * A name for this storytelling, or null when the card is still too thin to name
 * anything. Callers must treat null as "leave the placeholder alone".
 */
export function deriveStorytellingName(text: string | null | undefined): string | null {
  // Line breaks survive until the sentence has been picked — they are one of the
  // ways a thought ends. Only then is the remaining whitespace collapsed.
  const cleaned = stripPlaceholderMarks(stripNote(text ?? ''));
  if (!cleaned.trim()) return null;

  const sentence = tidy(firstSentence(cleaned).replace(/\s+/g, ' '));
  if (sentence.length < MIN_CHARS) return null;
  if (sentence.split(' ').filter(Boolean).length < MIN_WORDS) return null;

  // Trailing sentence punctuation is noise in a title («Я зупинилась.» → «Я
  // зупинилась»), but an ellipsis or a question mark is the author's voice.
  const named = clip(sentence.replace(/\.$/, ''));
  return named.length >= MIN_CHARS ? named : null;
}
