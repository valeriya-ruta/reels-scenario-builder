/**
 * Propose calendar dates for a freshly generated set of pieces (pure).
 *
 * A braindump that yields three days of storytelling must land on three days
 * the user can actually post — not three consecutive days stacked on top of
 * whatever is already booked. So the spread walks forward from today and takes
 * the next OPEN days: days that hold nothing yet.
 *
 * Ruta proposes the schedule; the user confirms it in one tap or moves
 * individual days. Nothing here writes anything.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Add `days` to a 'YYYY-MM-DD' key (UTC math — no timezone off-by-one). */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const a = Date.UTC(fy, (fm || 1) - 1, fd || 1);
  const b = Date.UTC(ty, (tm || 1) - 1, td || 1);
  return Math.round((b - a) / 86_400_000);
}

/** How far ahead we are willing to look before giving up and stacking. */
const SEARCH_HORIZON_DAYS = 60;

/**
 * `count` day keys starting at `todayKey`, skipping days already occupied.
 *
 * @param occupied day keys that already hold at least one piece
 * @param startOffset days to wait before the first proposal (0 = today)
 */
export function proposeSpread(
  todayKey: string,
  count: number,
  occupied: ReadonlyArray<string>,
  startOffset = 0,
): string[] {
  if (count <= 0) return [];
  const taken = new Set(occupied.map((d) => d.slice(0, 10)));
  const out: string[] = [];

  for (let offset = startOffset; offset < SEARCH_HORIZON_DAYS && out.length < count; offset++) {
    const key = addDays(todayKey, offset);
    if (taken.has(key)) continue;
    taken.add(key); // two proposals must never collide with each other either
    out.push(key);
  }

  // Calendar wall-to-wall booked for two months: fall back to consecutive days
  // rather than returning fewer dates than pieces. Better a stacked day the user
  // can move than a piece with no date at all.
  for (let i = out.length; i < count; i++) {
    out.push(addDays(out[out.length - 1] ?? todayKey, 1));
  }
  return out;
}

/**
 * Human line describing a spread, for the fan-out review's rationale:
 * "3 дні поспіль, з 31 лип" / "розкидала по вільних днях".
 */
export function isConsecutive(dates: ReadonlyArray<string>): boolean {
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1], dates[i]) !== 1) return false;
  }
  return true;
}
