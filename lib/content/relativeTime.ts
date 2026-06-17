/** Ukrainian relative-time label for content rows (e.g. "щойно", "2 год тому", "вчора"). */
export function formatRelativeTime(input: string | number | Date, now: Date = new Date()): string {
  const then = new Date(input);
  const diffMs = now.getTime() - then.getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 45) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  if (hour < 24) return `${hour} год тому`;
  if (day === 1) return 'вчора';
  if (day < 7) return `${day} дн тому`;

  const months = [
    'січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.',
    'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.',
  ];
  const sameYear = then.getFullYear() === now.getFullYear();
  const base = `${then.getDate()} ${months[then.getMonth()]}`;
  return sameYear ? base : `${base} ${then.getFullYear()}`;
}

const MONTHS_SHORT = [
  'січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.',
  'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.',
];

/** Short calendar date for list meta lines, e.g. "17 черв." ("17 черв. 2025" cross-year). */
export function formatShortDate(input: string | number | Date, now: Date = new Date()): string {
  const d = new Date(input);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
