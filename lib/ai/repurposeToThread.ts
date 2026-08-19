import { chatEndpoint } from '@/lib/ai/aiProvider';
import 'server-only';

import { detectOutputLanguage, type OutputLanguage } from '@/lib/ai/carouselPrompt';
import {
  deriveThreadTitle,
  normalizeThreadPosts,
  THREADS_POST_CHAR_LIMIT,
  THREAD_MAX_POSTS,
  THREAD_MIN_POSTS,
} from '@/lib/ai/threadNormalize';

/**
 * Repurpose → Threads post.
 *
 * The one output format the app had no generator for (carousel / reel /
 * storytelling all already have theirs, and repurposing reuses them). Same
 * provider and shape as its three siblings — Groq, JSON mode, temperature 0.7 —
 * so it lives on the same rails and shows up in the AI audit alongside them.
 *
 * A Threads post is a CHAIN: post 1 has to hold on its own, each following post
 * earns the next tap, and every post is capped at 500 characters by the platform.
 */

const MIN_POSTS = THREAD_MIN_POSTS;
const MAX_POSTS = THREAD_MAX_POSTS;

export interface GeneratedThread {
  title: string;
  posts: string[];
}

interface ThreadResponse {
  title?: string;
  posts?: unknown;
}

export function buildThreadSystemPrompt(outputLanguage: OutputLanguage): string {
  const languageRule =
    outputLanguage === 'en'
      ? 'МОВА ВІДПОВІДІ: англійська. Усі пости — англійською.'
      : 'МОВА ВІДПОВІДІ: українська. Усі пости — українською. НІКОЛИ не російська.';

  return `Ти пишеш тред у Threads для ОСОБИСТОГО бренду. Ти — голос самого автора: він ділиться власним досвідом, живо, чесно, з самоіронією. Не копірайтер-агенція, не коуч, не ШІ-асистент.

${languageRule}

══════════════════════════════
ЩО ТАКЕ ТРЕД
══════════════════════════════

Тред — це ЛАНЦЮЖОК коротких постів. Кожен пост — максимум ${THREADS_POST_CHAR_LIMIT} символів (жорсткий ліміт платформи), у нормі 150–350.

- ПОСТ 1 — тримає сам по собі. Це не «зараз розкажу» і не заголовок: це вже думка, з якої видно, про що мова, і яку хочеться дочитати. Ніяких «тред 🧵», «1/7», «поїхали».
- ПОСТИ 2…N — кожен несе ОДНУ думку і заробляє наступний тап. Не переказуй попередній пост, рухай далі.
- ОСТАННІЙ — м'яко замикає: висновок + одне живе запитання до читача (а не «підписуйся, якщо сподобалось»).

══════════════════════════════
ЯК ПИСАТИ
══════════════════════════════

- Коротко, розмовно, від першої особи. Так, як людина пише в телефоні, а не як пишуть у блозі.
- Абзаци всередині поста — можна, через порожній рядок. Довгих полотен — ні.
- Емодзі — рідко й доречно. Хештеги — не більше одного, і лише якщо він справді щось означає.
- Нумерацію постів («1/5») НЕ пиши: у Threads пости і так ідуть по черзі.
- НЕ вигадуй фактів, цифр, кейсів та імен, яких немає в оригіналі. Чого не знаєш — залиш у [квадратних дужках] як чесний плейсхолдер.

══════════════════════════════
КІЛЬКІСТЬ
══════════════════════════════

Від ${MIN_POSTS} до ${MAX_POSTS} постів. Стільки, скільки треба думці — не більше.

══════════════════════════════
ФОРМАТ ВІДПОВІДІ
══════════════════════════════

Лише JSON, без markdown і без тексту поза JSON:

{
  "title": "коротка назва треду (до 60 символів, для списку в застосунку)",
  "posts": ["текст першого поста", "текст другого поста"]
}`;
}

export function buildThreadUserContent(brief: string, outputLanguage: OutputLanguage): string {
  const languageHint =
    outputLanguage === 'en' ? 'Write the posts in English.' : 'Пиши пости українською.';
  return `${brief}\n\nЗроби з цього тред у Threads за правилами вище. ${languageHint}`;
}

export async function generateThreadFromBrief(brief: string): Promise<GeneratedThread> {
  const endpoint = chatEndpoint();
  const outputLanguage = detectOutputLanguage(brief);

  const res = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    body: JSON.stringify({
      model: endpoint.model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildThreadSystemPrompt(outputLanguage) },
        { role: 'user', content: buildThreadUserContent(brief, outputLanguage) },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('[repurpose-to-thread] Groq HTTP error:', res.status, body.slice(0, 500));
    throw new Error('Щось пішло не так. Спробуй ще раз.');
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawText = payload.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    console.error('[repurpose-to-thread] Empty model content');
    throw new Error('Щось пішло не так. Спробуй ще раз.');
  }

  let parsed: ThreadResponse;
  try {
    parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim()) as ThreadResponse;
  } catch (e) {
    console.error('[repurpose-to-thread] Invalid JSON from model:', rawText.slice(0, 500), e);
    throw new Error('Щось пішло не так. Спробуй ще раз.');
  }

  const posts = normalizeThreadPosts(parsed.posts);
  if (posts.length < MIN_POSTS) {
    console.error('[repurpose-to-thread] Too few posts:', rawText.slice(0, 500));
    throw new Error('Щось пішло не так. Спробуй ще раз.');
  }

  return { title: deriveThreadTitle(parsed.title, posts), posts };
}
