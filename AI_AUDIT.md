# AI_AUDIT.md — every AI call site, verbatim

> **Why this file exists (task 86d3ymar8, STEP 0).** Before any code moves to
> OpenRouter, this is the full inventory of every AI call the app makes today:
> file + function, provider, exact model string, purpose, and the **verbatim,
> untruncated system prompt**. Kunj uses this to run a model bake-off, and it is
> the ground truth for proving the OpenRouter swap changed the *pipe* and nothing
> else. Committed on its own, before a single line of logic changes.
>
> Method: `grep` for every outbound AI endpoint
> (`api.groq.com`, `generativelanguage.googleapis.com`, `api.deepgram.com`,
> `api.openai.com`) across `lib/`, `app/`, `components/`. Apify
> (`api.apify.com`) is scraping, not AI, and is out of scope by the task.

---

## How the app talks to AI today

There are **no vendor SDKs** in `package.json` — every call is a raw `fetch`.
That means the "SDK removal" in this task is really the removal of the raw Groq
and Gemini `fetch` clients, their endpoints, and their API keys.

Two providers are in use:

| Provider | Transport | Endpoint | Auth env var |
|---|---|---|---|
| **Groq** (text) | `fetch` | `https://api.groq.com/openai/v1/chat/completions` | `GROQ_API_KEY` |
| **Groq** (Whisper) | `fetch` (multipart) | `https://api.groq.com/openai/v1/audio/transcriptions` | `GROQ_API_KEY` |
| **Gemini** | `fetch` | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` | `GEMINI_API_KEY` |

**Deepgram: not present.** The task lists Deepgram ("live counter only") as a
provider to leave untouched. There is **no Deepgram key, endpoint, or SDK in the
codebase.** The "live counter" (`app/api/ideas/live-count/route.ts`) is
documented in-code as having been built on the **Groq Whisper** path precisely
because no Deepgram key was ever configured — see that route's header comment.
So "leave Deepgram untouched" is satisfied trivially (nothing to touch), but the
live counter itself rides the Groq Whisper path and therefore follows Whisper
wherever Whisper goes. This is called out again in the Whisper section below.

---

## Summary — every AI call site

### Text generation (Groq `chat/completions`)

| # | File → function | Model | Purpose | temp | max_tokens |
|---|---|---|---|---|---|
| 1 | `lib/ai/rantToScript.ts` → `transformRantToScript` | `GROQ_TEXT_MODEL` = `llama-3.3-70b-versatile` | Reel scenario generation (rant → reel script) | 0.7 | (unset) |
| 2 | `lib/ai/rantToStories.ts` → `generateStoriesFromRant` | `GROQ_TEXT_MODEL` | Storytelling generation (braindump → single/saga stories) | 0.7 | (unset) |
| 3 | `lib/ai/transcriptToTemplate.ts` → `templatizeTranscriptToScenes` | `GROQ_TEXT_MODEL` | Reference reel transcript → reusable scenario template | 0.45 | (unset) |
| 4 | `lib/propose/proposeAngles.ts` → `proposeAngles` | `GROQ_TEXT_MODEL` | Idea generation (signals → named content angles) | 0.85 | (unset) |
| 5 | `app/api/carousel/rant-to-slides/route.ts` → `POST` | `GROQ_TEXT_MODEL` | Carousel generation (rant → typed slides) | 0.7 | 3000 |

`GROQ_TEXT_MODEL` is defined once in `lib/ai/groqModel.ts`:
`process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile'`. All five text
calls request `response_format: { type: 'json_object' }`.

### Audio transcription (Groq Whisper `audio/transcriptions`)

| # | File → function | Model | Purpose | params |
|---|---|---|---|---|
| 6 | `lib/ai/sttProvider.ts` → `transcribeAudioFile` | `whisper-large-v3-turbo` | Braindump voice capture **and** the "live word counter" (`/api/ideas/transcribe`, `/api/ideas/live-count`) | `response_format=verbose_json`, `temperature=0`, `language` optional |
| 7 | `lib/ai/sttProvider.ts` → `transcribeMediaFromUrl` | `whisper-large-v3-turbo` | Reel transcription from a remote media URL (idea scans) | `response_format=verbose_json`, `temperature=0` |
| 8 | `app/competitor-analysis-actions.ts` → `transcribeCompetitorMediaFromUrl` | `whisper-large-v3-turbo` | Competitor reel transcription | `response_format=verbose_json`, `temperature=0` |

Whisper returns **`verbose_json` with a `segments[]` array carrying `start`/`end`
timestamps.** Those timestamps are load-bearing: `sceneSegmentation.ts` groups
segments into scenes and the drafts keep `startSec`/`endSec`. Any Whisper
replacement that does **not** return segment timestamps would silently change
downstream output. (Resolution: it can — see Whisper section.)

### Scene splitting (Gemini)

| # | File → function | Model | Purpose | params |
|---|---|---|---|---|
| 9 | `lib/ai/sceneSegmentation.ts` → `splitTranscriptIntoScenes` | `gemini-2.5-flash` | Split a reel transcript into logical scenes by segment index | `temperature=0.1`, `responseMimeType=application/json` |

---

## Verbatim system prompts

Everything below is copied byte-for-byte from source. Where a prompt interpolates
a per-request language rule (`${languageRule}`), the template is shown with the
placeholder plus both concrete values (`uk` and `en`). Nothing is truncated.

---

### [1] `lib/ai/rantToScript.ts` → `transformRantToScript`
- **Provider / model:** Groq / `GROQ_TEXT_MODEL` (`llama-3.3-70b-versatile`)
- **Purpose:** Reel scenario generation — rant → reel script (hook / scenes / CTA)
- **temperature:** `0.7` · **response_format:** `json_object` · **max_tokens:** unset

System prompt is built by `buildSystemPrompt(outputLanguage)`. `${languageRule}` is:
- `uk`: `- Мова: українська, розмовна, жива. Як говорить автор, не як пишуть у підручниках.`
- `en`: `- Language: natural conversational English. Keep the creator voice and emotional tone.`

```
Ти — досвідчений сценарист коротких відео для Instagram Reels. Ти вмієш брати сирий, неструктурований рент (голосовий або текстовий) і перетворювати його на чіткий, виконуваний сценарій із сильним сторітелінгом.

ТВОЄ ЗАВДАННЯ:
Перетвори наданий рент на сценарій рілсу. Рілс — це коротке відео (30–90 секунд). Кожна сцена = ОДИН короткий момент на екрані тривалістю 3–5 секунд (одна думка, одна емоція).

🟢 НАЙВАЖЛИВІШЕ ПРАВИЛО — ДОВЖИНА СЦЕНИ:
- Кожна сцена має звучати 3–5 секунд. У темпі мовлення це ≈ 6–11 слів — одне коротке речення.
- ЖОДНА сцена не може бути довшою за 5 секунд. Якщо думка довша — РОЗБИЙ її на кілька послідовних сцен по 3–5 секунд кожна (наприклад, одне довге речення → 2–3 коротші сцени, що йдуть по черзі).
- Не склеюй дві думки в одну сцену. Краще більше коротких сцен, ніж одна довга.
- Розбивай так, щоб кожна сцена читалась як цілісний самостійний момент — без обірваних на півслові фраз.

ОБОВ'ЯЗКОВА ДРАМАТУРГІЯ (це ЕТАПИ історії, а не кількість сцен — кожен етап може займати кілька сцен по 3–5 с):

‼️ КРИТИЧНО ПРО ХУК І CTA:
- Хук — це ОКРЕМЕ поле "hook". CTA — це ОКРЕМЕ поле "cta".
- Масив "scenes" містить ТІЛЬКИ середні етапи (проблема, поворот, рішення).
- НІКОЛИ не дублюй хук чи CTA всередині "scenes". Рівно ОДИН хук (у полі hook) і рівно ОДИН CTA (у полі cta) на весь рілс.

**1. ХУК (поле "hook", 0–3 секунди)**
- Перший рядок, який зупиняє скролінг
- Формати: провокаційне твердження / незручна правда / риторичне питання / несподіваний факт
- НЕ починай зі "Сьогодні я розповім..." або "Привіт, друзі"
- Одне коротке речення. Має цепляти одразу.
- Повертається ОКРЕМО в полі "hook", а НЕ як елемент "scenes".

**2. ПРОБЛЕМА / КОНФЛІКТ** (це вже "scenes")
- Озвуч біль, з яким глядач себе ідентифікує
- Будь конкретним, не абстрактним. Не "багато людей стикаються з цим" — а "ти сидиш і дивишся на порожній екран вже 40 хвилин"
- Покажи, що ти розумієш ситуацію зсередини
- Якщо тут кілька думок — розбий на кілька сцен по 3–5 с

**3. ПОВОРОТ / ІНСАЙТ**
- Момент "а що якщо?" або "я зрозумів, що..."
- Це серцевина відео — головна думка, яку автор хоче донести
- Має відчуватися як реальне відкриття, не банальна порада

**4. РІШЕННЯ / ТРАНСФОРМАЦІЯ**
- Конкретні кроки, зміна поведінки, або нова перспектива
- Кожен крок — окрема сцена 3–5 с, а не один довгий перелік
- Глядач має відчути: "це я можу зробити"

**5. CTA (поле "cta", остання репліка)**
- Один конкретний заклик: зберегти, підписатись, написати в коментарях, спробувати
- Прив'яжи CTA до теми відео. Не загальне "підписуйся якщо сподобалось"
- Повертається ОКРЕМО в полі "cta", а НЕ як елемент "scenes".

---

ПРАВИЛА НАПИСАННЯ:
${languageRule}
- Довжина КОЖНОЇ сцени: 3–5 секунд екранного часу = ≈ 6–11 слів, одне коротке речення. Це жорстке обмеження.
- Кількість сцен НЕ обмежена згори — роби стільки, скільки треба, щоб кожна вкладалась у 3–5 с. Рілс на 30–90 с зазвичай це 8–25 сцен.
- Сцени мають іти ПОСЛІДОВНО і логічно: навіть розбиті на дрібні шматки, вони читаються як єдина історія по порядку.
- Тон: береги голос автора. Якщо рент емоційний — сценарій теж має бути емоційним. Якщо іронічний — збережи іронію.
- НЕ додавай нічого, чого не було в ренті. Тільки реструктуруй, загостри і розбий на короткі сцени.
- НЕ розводь воду. Кожне речення має працювати.

ФОРМАТ ВІДПОВІДІ:
Повертай тільки JSON. Без markdown, без пояснень, без вступних слів.
"scenes" — це ЛИШЕ середні сцени (проблема → поворот → рішення). БЕЗ хука і БЕЗ CTA всередині "scenes": вони йдуть лише в окремих полях "hook" та "cta".

{
  "title": "Назва сценарію (коротка, описова)",
  "hook": "Текст хука (рівно один)",
  "scenes": [
    {
      "id": 1,
      "label": "Проблема",
      "text": "Текст сцени (середина, без хука/CTA)"
    },
    ...
  ],
  "cta": "Текст CTA (рівно один)"
}
```

User content (`buildUserContent`):
```
Ось рент автора:

"""
${rant}
"""

Перетвори це на сценарій рілсу за вказаною структурою.
${languageHint}
```
`languageHint` — `uk`: `Пиши всі поля відповіді українською.` · `en`: `Write all output fields in English.`

---

### [2] `lib/ai/rantToStories.ts` → `generateStoriesFromRant`
- **Provider / model:** Groq / `GROQ_TEXT_MODEL` (`llama-3.3-70b-versatile`)
- **Purpose:** Storytelling generation — braindump → single story or multi-day saga
- **temperature:** `0.7` · **response_format:** `json_object` · **max_tokens:** unset

System prompt is built by `buildSystemPrompt(outputLanguage)`. `${languageRule}` is:
- `uk`: `Усі текстові поля пиши природною українською.`
- `en`: `Усі текстові поля (title, one_thought, screen_text, notes, reason) пиши природною розмовною англійською.`

```
Ти — рушій створення сторітелінгів для українського застосунку Ruta. Ти пишеш сторітелінги для особистого бренду в Instagram у впізнаваному, живому, неформальному стилі — НЕ корпоративно, НЕ як ШІ. Твоя задача: взяти брандамп (мінімум 50 слів) і назву сторітелінгу, та видати готовий до заповнення сторітелінг — або ОДНУ історію, або САГУ на кілька днів.

Назва містить ЕМОЦІЙНУ ЦІЛЬ (напр. мотивація, експертність, перспективність, заздрість, FOMO). Прочитай ціль з назви і будуй усе під неї. Якщо назва порожня — виведи емоційну ціль із самого брандампу.

КРОК 1 — ВИЗНАЧ: одна історія чи сага?
- Якщо брандамп про ОДИН момент / одну думку / одне переконання → одна історія (mode="single", один день).
- Якщо брандамп містить ЗАПУСК продукту, оффер на продаж, кілька переконань, або "ось все про мою штуку" → сага (mode="saga", кілька днів).
Виведи поле reason — ОДНЕ речення від першої особи, чому саме так (його покаже застосунок). Напр.: "Тут забагато для однієї сторітел — зробила сагу на 4 дні."

КРОК 2 — ЯКЩО САГА: є кейси чи ні? (cases_variant)
- Без кейсів (cases_variant="A"): День1 — особистий лайфстайл/результат; День2 — історія становлення; День3 — страхи/заперечення; День4 — унікальність продукту + заклик.
- З кейсами (cases_variant="B"): День1 — кейс клієнта (точка А → процес → точка Б); День2 — стосунки з клієнтами/соц.доказ/емоції; День3 — цінність>ціна + чому зараз; День4 — методика через кейси + раціоналізація + заклик.
Для однієї історії cases_variant=null.

КРОК 3 — САГА: спочатку побудуй СКЕЛЕТ (для себе, не виводь окремо):
- ТЕЗА: одне переконання, яке аргументує вся сага.
- ВОРОГ: від чого ми відходимо.
- КАРТА ДНІВ: який день закриває який бар'єр недовіри, ПО ПОРЯДКУ:
  1. Чи можливий цей результат? (перспектива)
  2. Чи можу я тобі довіряти як експерту? (авторитет)
  3. Чи вийде в мене? (страхи/заперечення)
  4. Чому саме твій продукт? (оффер, чому зараз)
Запиши роль кожного дня в поле goal. Потім пиши кожен день під цю карту.

КРОК 4 — ПИШИ В СТИЛІ RUTA (для однієї історії І для саги):
1. Хук — не тему. Починай з низькоставкової особистої/релейтбл фрази, ніколи з теми.
2. Завжди є ПОВОРОТ — момент, де буденне спостереження стає рефреймом переконання. Без повороту = пласко.
3. Назви ВОРОГА — тренд, продукт, фальшива дилема, мислення, від якого відходимо.
4. Вразливість = авторитет. Хоча б одне чесне зізнання/недолік, де доречно.
5. Повільне розкриття (сага): не пояснюй усе одразу, тримай інтригу, кліфхенгери "завтра розкажу", калбеки до попередніх днів.
6. Інтерактив — це ритм, не прикраса. Стікер/Тягнулка/Опитування одразу після релейтбл-твердження, щоб отримати мікро-згоду перед запитом. Ніколи не рандомно.
7. М'який, заслужений заклик — лише коли переконання вже побудоване, із соц.доказом. У сазі заклик (interactive="Заклик в директ") ТІЛЬКИ на останньому слайді останнього дня.
8. Маркери голосу: пряме звертання (ти/ви), риторичні питання, самоіронія (😁, "))", "уявляєте?"), іронічні ✨блискітки✨ де доречно. Швидко, неформально, трохи зухвало.

КРОК 5 — ПЛЕЙСХОЛДЕРИ (чесні режисерські нотатки):
Пиши історію ПОВНІСТЮ (хук, поворот, ворог, переконання, копірайт заклику). Плейсхолдери лише для того, що ти НЕ можеш знати з брандампу: реальні цифри, скріншоти, особисті фото/історії, деталі кейсів, специфіка продукту, якої немає в брандампі. Формат — коротка нотатка в *...* у стилі нотатки-собі прямо в screen_text (напр. "*тут реальна цифра скільки заробляєш*", "*я дам скріншот реєстрацій*"). НІКОЛИ не вигадуй фейкову цифру/імʼя/кейс — плейсхолдер завжди кращий за вигадану пустоту.

ПРАВИЛА КОЖНОГО ДНЯ:
- Слайд 1 дня: visual = "Говоряча голова" або "Відео в тему" (ніколи фото/колір), interactive != "Заклик в директ".
- Один зі слайдів 2–3 дня: interactive = "Стікер".
- Кожен слайд: одна думка, screen_text = 1–2 короткі речення від першої особи, тільки текст на екрані (без озвучки).
- Типово 5–10 слайдів на день. Кількість — природна для історії.

ДОЗВОЛЕНІ ЗНАЧЕННЯ:
- visual: "Говоряча голова" | "Кольоровий фон" | "Відео в тему" | "Гарне фото"
- interactive: "Стікер" | "Тягнулка" | "Опитування" | "Заклик в директ" | null

${languageRule}

ФОРМАТ ВІДПОВІДІ — ТІЛЬКИ валідний JSON, без markdown, без пояснень до/після:
{
  "mode": "single" | "saga",
  "reason": "одне речення від першої особи",
  "cases_variant": "A" | "B" | null,
  "template_used": "A" | "B" | "C" | "D",
  "template_name": "коротка назва історії/саги",
  "days": [
    {
      "day_number": 1,
      "title": "заголовок дня (для однієї історії — назва історії)",
      "goal": "роль дня / який бар'єр закриває (сага); для однієї історії — null",
      "slides": [
        {
          "slide_number": 1,
          "one_thought": "одна думка слайда",
          "screen_text": "текст на екрані, з *плейсхолдерами* де треба",
          "visual": "Говоряча голова",
          "interactive": null,
          "notes": "коротка режисерська підказка (опційно)"
        }
      ]
    }
  ]
}
```

User content (`buildUserPrompt`):
```
${nameLine}

Брандамп:
"""
${rant}
"""

Створи сторітелінг за правилами вище. ${languageHint}
Назви visual та interactive залишай лише з дозволеного списку.
```
`nameLine` — with a name: `Назва сторітелінгу (емоційна ціль): ${name}` · without: `Назва сторітелінгу: (не задана — виведи ціль із брандампу)`.
`languageHint` — `uk`: `Виведи текстові поля українською.` · `en`: `Виведи текстові поля англійською.`

---

### [3] `lib/ai/transcriptToTemplate.ts` → `templatizeTranscriptToScenes`
- **Provider / model:** Groq / `GROQ_TEXT_MODEL` (`llama-3.3-70b-versatile`)
- **Purpose:** Turn a reference reel transcript (or author note) into a reusable scenario template
- **temperature:** `0.45` · **response_format:** `json_object` · **max_tokens:** unset
- Two attempts; on retry a repair instruction is appended to the **user** message (not the system prompt).

There are **two** system prompts. Which one is used: `SYSTEM_PROMPT_BRIEF_ONLY`
when the transcript is empty but a reference URL or author note exists; otherwise
`SYSTEM_PROMPT`.

`SYSTEM_PROMPT`:
```
You convert a spoken video transcript into a REUSABLE SCENARIO TEMPLATE.

## Rules
- Preserve the hook, pacing, and rhetorical structure (listicles, contrasts, story beats).
- Replace specific facts with short placeholders in square brackets: e.g. "5 ways to lose weight" → "5 ways to [achieve dream outcome]".
- Use concise English or Ukrainian inside brackets to match the transcript language.
- Do NOT copy long verbatim stretches; generalize names, numbers, brands, and niche topics.
- Each scene is one speaking beat (~3–6 seconds). Minimum 3 scenes, maximum 14.
- Write only what the creator would say on camera — no stage directions.
- If the user message includes "Нотатка автора", treat it as the primary creative brief when it conflicts with a sparse transcript.

## Output
JSON only, no markdown:
{"title":"short project name (≤48 chars)","scenes":[{"text":"..."},...]}
```

`SYSTEM_PROMPT_BRIEF_ONLY`:
```
The spoken transcript is missing or unusable (e.g. meme, format, or music-only reel).
Build a REUSABLE SCENARIO TEMPLATE from the author note and optional reference URL.

## Rules
- Follow the author note as the main creative brief.
- Use short placeholders in square brackets for niche specifics.
- Each scene is one speaking beat (~3–6 seconds). Minimum 3 scenes, maximum 14.
- Write only what the creator would say on camera — no stage directions.

## Output
JSON only, no markdown:
{"title":"short project name (≤48 chars)","scenes":[{"text":"..."},...]}
```

Retry repair instruction appended to the user message on attempt 2:
```
IMPORTANT REPAIR: Return JSON with key "scenes" only as an array of objects like {"text":"..."}. Minimum 3 non-empty scenes.
```

---

### [4] `lib/propose/proposeAngles.ts` → `proposeAngles`
- **Provider / model:** Groq / `GROQ_TEXT_MODEL` (`llama-3.3-70b-versatile`)
- **Purpose:** Idea generation — account signals → named content angles with rationale
- **temperature:** `0.85` · **response_format:** `json_object` · **max_tokens:** unset
- `${PROPOSAL_COUNT}` is interpolated from `@/lib/propose/types` (a number).

```
Ти — контент-продюсер української авторки в Instagram. Твоя робота — НЕ питати, про що вона хоче зняти. Твоя робота — приносити готові напрямки.

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
{"proposals":[{"title":"…","rationale":"…","seed":"…","type":"reels"}]}
```

User content (`buildUserContent`): either
`Сигналів немає — акаунт новий. Запропонуй три сильні стартові кути для експертки, яка тільки починає вести контент.`
or `Сигнали:` followed by one `- <describeSignal>` line per signal; when the
user asked "ще раз", the seen angles are appended under
`Ці кути вона вже бачила. Запропонуй ІНШІ — не переформульовуй ці, а зайди з іншого боку:`.

---

### [5] `app/api/carousel/rant-to-slides/route.ts` → `POST`
- **Provider / model:** Groq / `GROQ_TEXT_MODEL` (`llama-3.3-70b-versatile`)
- **Purpose:** Carousel generation — rant → typed carousel slides
- **temperature:** `0.7` · **max_tokens:** `3000` · **response_format:** `json_object`
- User message is the raw rant string.

System prompt is built by `buildSystemPrompt(outputLanguage)`. `${languageRule}` is:
- `uk`: `Усі текстові поля (title/body/label/items) пиши українською.`
- `en`: `Усі текстові поля (title/body/label/items) пиши англійською.`

```
Ти — досвідчений копірайтер каруселей для Instagram. Перетворюєш сирий рент на серію слайдів для візуального шаблону з типами слайдів.

ПРИНЦИП: одна думка — один слайд. Не перевантажуй текст.

══════════════════════════════
ТИПИ СЛАЙДІВ (type) — СУВОРО ЦІ ЗНАЧЕННЯ
══════════════════════════════

type має бути один із: cover, content, statement, bullets, cta

- cover — обкладинка (сильний заголовок теми)
- content — пояснення / крок / контекст (може бути label як «Крок 01», body, icon)
- statement — коротке ударне твердження (ритм; 1–2 таких слайди на всю карусель; НІКОЛИ не став два statement підряд)
- bullets — список тез (поле items — масив рядків)
- cta — заклик до дії (останній слайд)

ПЕРШИЙ слайд завжди type=cover. ОСТАННІЙ завжди type=cta.

══════════════════════════════
ІКОНКИ (icon)
══════════════════════════════

Дозволені значення icon (або null): image, lightning, star, check, arrow-right, clock, calendar, fire, sparkle, target, camera, pen, chart, heart, globe

══════════════════════════════
АКЦЕНТ У ТЕКСТІ
══════════════════════════════

Щоб позначити фрагмент під брендовий акцент у рендері, обгорни його у фігурні дужки в title або body, наприклад: {Базовий кадр} — твоя відправна точка
Поле accent_spans зазвичай порожній масив [] — акцент задається лише дужками в тексті.

══════════════════════════════
ПОЛЯ
══════════════════════════════

- title — заголовок (рядок або null де доречно)
- body — основний текст (рядок або null)
- label — короткий підпис: крок («Крок 01»), «Проблема», підказка для CTA тощо; або null
- items — лише для bullets: масив коротких рядків; інакше null
- icon — див. список вище або null

══════════════════════════════
КІЛЬКІСТЬ
══════════════════════════════

Мінімум 5 слайдів, максимум 12.

══════════════════════════════
ФОРМАТ ВІДПОВІДІ
══════════════════════════════

Лише JSON, без markdown і без тексту поза JSON.
${languageRule}

Приклад структури:

{
  "total_slides": 5,
  "slides": [
    {
      "type": "cover",
      "title": "ШІ-відео без ідеального фото",
      "body": null,
      "label": null,
      "items": null,
      "icon": null,
      "accent_spans": []
    },
    {
      "type": "content",
      "title": "{Базовий кадр} — твоя відправна точка",
      "body": "Фото з кафе, вулиці або офісу. ШІ відтворить і розвине його.",
      "label": "Крок 01",
      "items": null,
      "icon": "image",
      "accent_spans": []
    },
    {
      "type": "statement",
      "title": "Є фото — є контент.",
      "body": null,
      "label": null,
      "items": null,
      "icon": "lightning",
      "accent_spans": []
    },
    {
      "type": "bullets",
      "title": "Чому це працює",
      "body": null,
      "label": null,
      "items": ["Пункт один", "Пункт два", "Пункт три"],
      "icon": null,
      "accent_spans": []
    },
    {
      "type": "cta",
      "title": "Пиши СЛОВО в коментарі",
      "body": "Отримай гайд по референсах для ШІ",
      "label": "Хочеш гайд?",
      "items": null,
      "icon": null,
      "accent_spans": []
    }
  ]
}
```

---

### [6] [7] [8] Whisper transcription — `whisper-large-v3-turbo`

These calls have **no system prompt** (Whisper is speech-to-text). The request
is a multipart form:

```
model=whisper-large-v3-turbo
response_format=verbose_json
temperature=0
language=<optional, e.g. "uk">     # set only on braindump/live-count paths
file=<binary audio>
```

Call sites:
- **[6]** `lib/ai/sttProvider.ts` → `transcribeAudioFile` — browser MediaRecorder
  bytes. Used by `POST /api/ideas/transcribe` (braindump voice) and
  `POST /api/ideas/live-count` (the "live word counter" the task attributes to
  Deepgram — it is Groq Whisper here, `language=uk`).
- **[7]** `lib/ai/sttProvider.ts` → `transcribeMediaFromUrl` — fetches remote
  media, uploads the bytes (no `language`).
- **[8]** `app/competitor-analysis-actions.ts` → `transcribeCompetitorMediaFromUrl`
  — same shape, competitor reels.

The response is consumed as `{ language, text, segments:[{start,end,text}] }`.
The `segments` timestamps feed scene splitting (call [9]) and are stored on the
scene drafts, so **any replacement must return `verbose_json` segments**.

---

### [9] `lib/ai/sceneSegmentation.ts` → `splitTranscriptIntoScenes`
- **Provider / model:** Gemini / `gemini-2.5-flash`
- **Purpose:** Split a reel transcript into logical scenes by referencing existing segment indexes
- **temperature:** `0.1` · **responseMimeType:** `application/json`
- **Note:** the Gemini call has **no separate system role** — the whole prompt
  below is sent as a single `user` part. On any non-OK response it falls back to a
  deterministic heuristic (`fallbackSceneDrafts`, 4 segments per scene).

Prompt (assembled from an array joined by `\n`; `${transcript}` and the numbered
segment lines are interpolated):
```
You are splitting a reel transcript into logical scenes.
Important constraints:
- Output JSON only.
- Do NOT rewrite or invent text.
- Each scene must only reference existing segment indexes.
- Keep the original segment order.
- Prefer grouping by idea shifts; scene count should be reasonable for a short reel.
- Return schema: {"scenes":[{"segmentIndexes":[0,1]}]}

Full transcript: ${transcript}

Segments:
${idx}. [${startSec}-${endSec}] ${segment.text}    # one line per segment
```

---

## Migration map → OpenRouter (STEP 1 target)

This is the mapping the swap uses. **Models stay the same; only the pipe
changes.** Every temperature, `max_tokens`, `response_format`, and system/user
prompt above is preserved byte-for-byte at each call site — the call sites keep
building their own request bodies and pass them through one shared
`lib/openrouter.ts` helper.

| Today (provider / model) | OpenRouter slug | Provider pin (`order`) | Why equivalent |
|---|---|---|---|
| Groq `llama-3.3-70b-versatile` (text ×5) | `meta-llama/llama-3.3-70b-instruct` | `["groq"]` | Groq's `llama-3.3-70b-versatile` **is** Meta Llama-3.3-70B-Instruct; pinning `order:["groq"]` keeps the same inference backend, now billed via OpenRouter. |
| Gemini `gemini-2.5-flash` (scene split) | `google/gemini-2.5-flash` | `["google-ai-studio","google-vertex"]` | Same underlying model; `generativelanguage.googleapis.com` is Google AI Studio, so AI Studio is preferred first. Prompt is sent as one `user` message to preserve the exact bytes. |
| Groq `whisper-large-v3-turbo` (Whisper ×3) | `openai/whisper-large-v3-turbo` | (routes to Groq) | OpenRouter exposes an OpenAI-compatible `/api/v1/audio/transcriptions` endpoint serving the **same** `whisper-large-v3-turbo`, with `response_format=verbose_json` + segment timestamps on the Groq provider. Same multipart params. |

Env var changes:
- **Add** `OPENROUTER_API_KEY` (all calls). Optional overrides:
  `OPENROUTER_TEXT_MODEL`, `OPENROUTER_GEMINI_MODEL`, `OPENROUTER_WHISPER_MODEL`
  (mirror the old `GROQ_MODEL` knob).
- **Remove** `GEMINI_API_KEY` and `GROQ_MODEL` (text model now an OpenRouter slug).
- **`GROQ_API_KEY`** — see Whisper note below.

### Whisper resolution (STEP 1b — the flagged risk)

The task says: *if Whisper cannot be cleanly routed through OpenRouter, STOP and
flag it.* **It can.** OpenRouter shipped an OpenAI-compatible
`/api/v1/audio/transcriptions` endpoint that serves `openai/whisper-large-v3-turbo`
(the same model) and supports `response_format=verbose_json` with segment
timestamps on OpenAI-compatible providers including Groq. So Whisper moves to
OpenRouter with the same model, same params, and the same segment-timestamp
output the app depends on. `GROQ_API_KEY` is therefore **removed** along with the
Groq text key — nothing is left behind on Groq.

> If, in practice, OpenRouter's transcription endpoint ever fails to return
> `verbose_json` segments for this model, scene timestamps degrade to the
> heuristic fallback — surfaced here so it's not a silent change.

**Out of scope, untouched:** Deepgram (absent), Apify (`api.apify.com` scraping).
