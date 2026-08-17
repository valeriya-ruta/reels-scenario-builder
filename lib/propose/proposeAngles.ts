import { chatEndpoint } from '@/lib/ai/aiProvider';
import type { ContentType } from '@/lib/contentTypes';
import { CONTENT_TYPE_ORDER } from '@/lib/contentTypes';
import type { Proposal, ProposalSignal } from '@/lib/propose/types';
import { PROPOSAL_COUNT } from '@/lib/propose/types';
import { daysUk, normalizeTitle } from '@/lib/propose/fallback';

/**
 * AI leg of the proposal system: signals → named angles with one-line rationale.
 *
 * The contract the UI depends on is enforced in `normalizeProposals`, not in the
 * prompt: every proposal that reaches a screen has a non-empty title, a
 * non-empty rationale, and a seed. Anything the model returns short of that is
 * dropped, and the caller tops up from the deterministic fallback.
 */

const SYSTEM_PROMPT = `Ти — контент-продюсер української авторки в Instagram. Твоя робота — НЕ питати, про що вона хоче зняти. Твоя робота — приносити готові напрямки.

Тобі дають СИГНАЛИ — факти з її акаунта (що вже опубліковано, які думки вона накидала і не використала, що лежить без дати).

Поверни ${PROPOSAL_COUNT} різні кути подачі. Кожен — це:
- "title": сам кут, ОДИН рядок, до 60 символів. Це твердження або напрямок, НЕ питання до неї. Не "Про що розповісти?" а "Помилка, яку роблять усі".
- "rationale": ОДИН короткий рядок, чому саме це саме зараз. Спирайся на сигнал: «це вже спрацювало минулого тижня», «твій дамп 3 дні тому так і не став контентом». Без загальних слів на кшталт «це цікаво аудиторії».
- "seed": 1–2 речення, з яких генератор зможе зробити повний контент. Це розгорнутий кут, а не назва.
- "type": один із "reels" | "carousel" | "stories" | null — формат, під який цей кут найкраще лягає.

ПРАВИЛА:
- Мова — українська, жива, як говорить авторка. Ніякої російської.
- ${PROPOSAL_COUNT} кути мають бути РІЗНІ за типом думки (не три варіації одного).
- Не вигадуй цифр охоплень чи статистики — ти їх не знаєш.
- Не звертайся до авторки із запитаннями. Ти пропонуєш, вона підтверджує.

Формат відповіді — рівно такий JSON:
{"proposals":[{"title":"…","rationale":"…","seed":"…","type":"reels"}]}`;

function describeSignal(signal: ProposalSignal): string {
  const age = signal.ageDays === 0 ? 'сьогодні' : `${daysUk(signal.ageDays)} тому`;
  switch (signal.kind) {
    case 'proven':
      return `ОПУБЛІКОВАНО (${age}): «${signal.label}»`;
    case 'unused-dump':
      return `НЕВИКОРИСТАНИЙ ДАМП (${age}): «${signal.label}»`;
    case 'stale':
      return `ЛЕЖИТЬ БЕЗ ДАТИ (${age}): «${signal.label}»`;
    default:
      return `ПОЧАТОК: історії ще немає`;
  }
}

export function buildUserContent(
  signals: ProposalSignal[],
  exclude: ReadonlyArray<string> = [],
): string {
  const base =
    signals.length === 0
      ? 'Сигналів немає — акаунт новий. Запропонуй три сильні стартові кути для експертки, яка тільки починає вести контент.'
      : ['Сигнали:', ...signals.map((s) => `- ${describeSignal(s)}`)].join('\n');
  if (exclude.length === 0) return base;
  // «Ще раз» — she has seen these and asked for something else. Say so
  // explicitly, or the model happily returns the same angle reworded.
  return [
    base,
    '',
    'Ці кути вона вже бачила. Запропонуй ІНШІ — не переформульовуй ці, а зайди з іншого боку:',
    ...exclude.map((t) => `- ${t}`),
  ].join('\n');
}

type RawProposal = {
  title?: unknown;
  rationale?: unknown;
  seed?: unknown;
  type?: unknown;
};

function asType(value: unknown): ContentType | null {
  return CONTENT_TYPE_ORDER.includes(value as ContentType) ? (value as ContentType) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Keep only proposals that satisfy the UI contract. A proposal missing its
 * rationale is exactly the "AI wrapper with buttons" we are removing, so it is
 * dropped rather than rendered bare.
 */
export function normalizeProposals(raw: unknown): Proposal[] {
  const list = Array.isArray((raw as { proposals?: unknown })?.proposals)
    ? ((raw as { proposals: RawProposal[] }).proposals)
    : [];

  const out: Proposal[] = [];
  list.forEach((item, i) => {
    const title = str(item?.title);
    const rationale = str(item?.rationale);
    if (!title || !rationale) return;
    out.push({
      id: `ai-${i}`,
      title,
      rationale,
      seed: str(item?.seed) || title,
      suggestedType: asType(item?.type),
      source: 'cold-start',
    });
  });
  return out.slice(0, PROPOSAL_COUNT);
}

export async function proposeAngles(
  signals: ProposalSignal[],
  exclude: ReadonlyArray<string> = [],
): Promise<Proposal[]> {
  const ai = chatEndpoint();

  const res = await fetch(ai.url, {
    method: 'POST',
    headers: ai.headers,
    body: JSON.stringify({
      model: ai.model,
      temperature: 0.85,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContent(signals, exclude) },
      ],
    }),
  });

  if (!res.ok) {
    console.error('[propose] Groq HTTP error:', res.status, await res.text());
    return [];
  }

  const payload = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) return [];

  try {
    return normalizeProposals(JSON.parse(text));
  } catch (e) {
    console.error('[propose] Invalid JSON from model:', text, e);
    return [];
  }
}

/** Carry the evidence kind from the signals onto AI-worded proposals. */
export function tagWithSourceKinds(proposals: Proposal[], signals: ProposalSignal[]): Proposal[] {
  return proposals.map((p, i) => ({ ...p, source: signals[i]?.kind ?? 'cold-start' }));
}

/** Drop anything the user has already been shown, whatever the model returned. */
export function dropSeen(proposals: Proposal[], exclude: ReadonlyArray<string>): Proposal[] {
  if (exclude.length === 0) return proposals;
  const seen = new Set(exclude.map(normalizeTitle));
  return proposals.filter((p) => !seen.has(normalizeTitle(p.title)));
}
