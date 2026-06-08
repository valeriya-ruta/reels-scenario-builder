/**
 * Time-of-day aware greeting. Pure function of the local hour so it is trivially
 * testable and recomputes whenever the Home page mounts.
 *
 * Cutoffs:
 *   05:00–11:59 → "Доброго ранку" (morning)
 *   12:00–17:59 → "Добрий день"   (day)
 *   18:00–04:59 → "Добрий вечір"  (evening / night)
 */
export function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Доброго ранку';
  if (hour >= 12 && hour < 18) return 'Добрий день';
  return 'Добрий вечір';
}

/** Full greeting line including the user's name, e.g. "Добрий день, Валерія". */
export function greetingLine(hour: number, name?: string | null): string {
  const base = greetingForHour(hour);
  const trimmed = name?.trim();
  return trimmed ? `${base}, ${trimmed}` : base;
}
