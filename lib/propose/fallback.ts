/**
 * Deterministic proposals from signals (pure).
 *
 * This is NOT a degraded path we tolerate — it is the guarantee behind the
 * north-star rule. The AI leg can time out, rate-limit or return junk; the
 * screen must still open with proposals rather than an empty box. So the
 * fallback is written to be genuinely usable on its own, and the AI leg only
 * ever *improves* the wording.
 */

import type { Proposal, ProposalSignal } from '@/lib/propose/types';
import { PROPOSAL_COUNT } from '@/lib/propose/types';

/** Ukrainian day-count with correct plural forms («1 день / 3 дні / 8 днів»). */
export function daysUk(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дні`;
  return `${n} днів`;
}

/**
 * Cold-start angles: used when the user has no history yet. Phrased as
 * DIRECTIONS ("the mistake everyone makes"), never as questions back to the
 * user — a question is just a blank prompt with a friendlier face.
 */
export const COLD_START_PROPOSALS: readonly Omit<Proposal, 'id'>[] = [
  {
    title: 'Помилка, яку у твоїй ніші роблять майже всі',
    rationale: 'Найшвидший спосіб показати експертність — назвати те, що бачиш щодня.',
    seed: 'Помилка, яку роблять майже всі у моїй ніші, і що робити натомість.',
    suggestedType: 'reels',
    source: 'cold-start',
  },
  {
    title: 'Кейс, який пішов не за планом',
    rationale: 'Конкретна історія з деталями тримає до кінця краще за будь-яку пораду.',
    seed: 'Реальний кейс, який пішов не за планом: що сталося, що я зробила, чим закінчилось.',
    suggestedType: 'stories',
    source: 'cold-start',
  },
  {
    title: 'Що ти перестала робити — і чому',
    rationale: 'Відмова читається сміливіше за пораду й одразу показує позицію.',
    seed: 'Те, що я перестала робити у своїй роботі, і чому це виявилось правильним рішенням.',
    suggestedType: 'carousel',
    source: 'cold-start',
  },
] as const;

function proposalFromSignal(signal: ProposalSignal, index: number): Proposal {
  const id = `sig-${signal.kind}-${index}`;
  switch (signal.kind) {
    case 'proven':
      return {
        id,
        title: `Продовження теми: ${signal.label}`,
        rationale: `«${signal.label}» ти вже довела до публікації — тут лишилось що сказати.`,
        seed: `Продовження теми «${signal.label}»: що я не встигла сказати минулого разу і що змінилось відтоді.`,
        suggestedType: signal.type,
        source: 'proven',
      };
    case 'unused-dump':
      return {
        id,
        title: signal.label,
        rationale:
          signal.ageDays === 0
            ? 'Сьогоднішній дамп, з якого ще нічого не зроблено.'
            : `Твій дамп ${daysUk(signal.ageDays)} тому так і не став контентом.`,
        seed: signal.label,
        suggestedType: null,
        source: 'unused-dump',
      };
    case 'stale':
      return {
        id,
        title: `Дожати: ${signal.label}`,
        rationale: `Лежить без дати ${daysUk(signal.ageDays)} — або в календар, або відпускаємо.`,
        seed: `Доробити «${signal.label}» і поставити дату.`,
        suggestedType: signal.type,
        source: 'stale',
      };
    default:
      return { id, ...COLD_START_PROPOSALS[index % COLD_START_PROPOSALS.length] };
  }
}

/**
 * Build the proposal set. Signals lead; cold-start angles top up so the user is
 * never shown fewer than `count` directions.
 */
export function fallbackProposals(
  signals: ProposalSignal[],
  count: number = PROPOSAL_COUNT,
  /** Titles already shown this session — «Ще раз» must move on (§2). */
  exclude: ReadonlyArray<string> = [],
): Proposal[] {
  const seen = new Set(exclude.map(normalizeTitle));
  const fresh = (p: Proposal) => !seen.has(normalizeTitle(p.title));
  const out: Proposal[] = [];
  // At most one proposal per kind, so three signals of the same shape don't
  // produce three near-identical cards.
  const usedKinds = new Set<string>();
  signals.forEach((signal, i) => {
    if (out.length >= count || usedKinds.has(signal.kind)) return;
    const candidate = proposalFromSignal(signal, i);
    if (!fresh(candidate)) return;
    usedKinds.add(signal.kind);
    out.push(candidate);
  });

  for (let i = 0; out.length < count && i < COLD_START_PROPOSALS.length; i++) {
    const candidate = { id: `cold-${i}`, ...COLD_START_PROPOSALS[i] };
    if (fresh(candidate)) out.push(candidate);
  }
  // Exhausted every distinct angle: better to repeat than to show a blank deck.
  for (let i = 0; out.length < count && i < COLD_START_PROPOSALS.length; i++) {
    out.push({ id: `cold-repeat-${i}`, ...COLD_START_PROPOSALS[i] });
  }
  return out.slice(0, count);
}

/** Case/whitespace-insensitive title key, so near-repeats are caught too. */
export function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}
