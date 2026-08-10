# AI call-site audit

Complete inventory of every AI/model call in the app, as of this commit.

Produced as **STEP 0** of ClickUp task [`86d3ymar8`](https://app.clickup.com/t/86d3ymar8)
(*Migrate all AI calls to OpenRouter*), and the input for
[`86d3ymaw7`](https://app.clickup.com/t/86d3ymaw7) (*Model bake-off*).

Nothing here is a proposal. It documents what runs in production **today**.

---

## Summary table

| # | Purpose | File | Function | Provider | Model | Temp | Other params |
|---|---|---|---|---|---|---|---|
| 1 | Carousel generation | `lib/ai/carouselPrompt.ts` + `app/api/carousel/rant-to-slides/route.ts` | `POST` | Groq | `GROQ_TEXT_MODEL` | 0.7 | `max_tokens: 3000`, `response_format: json_object` |
| 2 | Reel scenario generation | `lib/ai/rantToScript.ts` | `transformRantToScript` | Groq | `GROQ_TEXT_MODEL` | 0.7 | `response_format: json_object` |
| 3 | Storytelling generation | `lib/ai/rantToStories.ts` | `generateStoriesFromRant` | Groq | `GROQ_TEXT_MODEL` | 0.7 | `response_format: json_object` |
| 4 | Idea / angle proposals | `lib/propose/proposeAngles.ts` | `proposeAngles` | Groq | `GROQ_TEXT_MODEL` | 0.85 | `response_format: json_object` |
| 5 | Transcript → reusable template | `lib/ai/transcriptToTemplate.ts` | `templatizeTranscriptToScenes` | Groq | `GROQ_TEXT_MODEL` | 0.45 | `response_format: json_object`, 2 attempts w/ repair instruction |
| 6 | Scene splitting | `lib/ai/sceneSegmentation.ts` | `splitTranscriptIntoScenes` | Gemini | `gemini-2.5-flash` | 0.1 | `responseMimeType: application/json`, heuristic fallback |
| 7 | Whisper — braindump voice capture | `lib/ai/sttProvider.ts` | `transcribeAudioFile` | Groq | `whisper-large-v3-turbo` | 0 | `verbose_json`, 25 MB cap |
| 8 | Whisper — reel URL transcription | `lib/ai/sttProvider.ts` | `transcribeMediaFromUrl` | Groq | `whisper-large-v3-turbo` | 0 | `verbose_json`, 25 MB cap |
| 9 | Whisper — competitor reel transcription | `app/competitor-analysis-actions.ts` | `transcribeCompetitorMediaFromUrl` | Groq | `whisper-large-v3-turbo` | 0 | `verbose_json`, 25 MB cap, 3 attempts, concurrency 3 |

`GROQ_TEXT_MODEL` is defined in `lib/ai/groqModel.ts`:

```ts
export const GROQ_TEXT_MODEL = process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
```

So **one env var (`GROQ_MODEL`) currently controls call sites 1–5 together.** There is no
per-call-site model override today — the bake-off's per-type winners will need one.

### Explicitly out of scope (do not touch)

| Thing | Where | Why |
|---|---|---|
| Deepgram | `app/api/ideas/live-count/route.ts` | Live word counter only. Task 86d3ymar8 says leave intact. Note: no Deepgram key is provisioned yet — the route documents this. |
| Apify | `lib/ai/competitorReelsApify.ts`, `lib/ai/instagramMedia.ts`, `lib/ai/tiktokMedia.ts`, `lib/insights/apifyInsights.ts` | Scraping, not inference. Leave intact. |

### Env vars in play

| Var | Used by | Status |
|---|---|---|
| `GROQ_API_KEY` | call sites 1–5, 7–9 | live |
| `GROQ_MODEL` | optional override for 1–5 | optional |
| `GEMINI_API_KEY` | call site 6 | live |
| `OPENROUTER_API_KEY` | *nothing yet* | to be added |
| `APIFY_TOKEN` | Apify (out of scope) | live |

---

## The safety net that hides drift

Three call sites pass raw model output through a **repairing** normalizer before the app
sees it. This matters enormously for the bake-off: a model can violate the prompt badly and
still produce a valid-looking app result, because the normalizer silently fixes it.

| Call site | Normalizer | What it silently repairs |
|---|---|---|
| Carousel | `lib/ai/carouselRantPostProcess.ts` | Forces slide 1 → `cover`, last → `cta`; rewrites adjacent `statement` → `content`; caps `statement` at 2; drops unknown types/icons |
| Reel | `flattenToSceneDrafts` in `lib/ai/rantToScript.ts` | Drops middle scenes that duplicate the hook/CTA or are labelled as one |
| Storytelling | `lib/ai/storiesNormalize.ts` | Clamps to 10 slides/day and 7 days; forces slide 1 visual + no CTA; force-plants `Стікер` on slide 2 if missing; strips `Заклик в директ` everywhere then plants it on the final slide only; substitutes placeholder text for empty fields |

**Therefore the bake-off scores RAW model output, not normalized output.** Post-normalization
everything looks compliant; the raw JSON is where the drift is visible. The harness records both.

---

## Verbatim prompts

The prompts below are the source of truth for the bake-off. They are **not** pasted copies —
the harness in `scripts/bakeoff/` imports these exact functions, so the two can never drift.
The text is reproduced here for human reading (per the task's requirement).

---

### 1. Carousel generation

- **File:** `lib/ai/carouselPrompt.ts` (`buildSystemPrompt`), called from `app/api/carousel/rant-to-slides/route.ts`
- **User message:** the raw rant, unmodified.
- **Language:** `detectOutputLanguage(rant)` — `en` if ≥20 Latin chars and Latin ≥ 1.2× Cyrillic, else `uk`.

The `${languageRule}` interpolation is one of:
- `uk` → `Усі текстові поля (title/body/label/items) пиши українською.`
- `en` → `Усі текстові поля (title/body/label/items) пиши англійською.`

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

### 2. Reel scenario generation

- **File:** `lib/ai/rantToScript.ts` (`buildSystemPrompt`, `buildUserContent`)
- **Language:** same `detectOutputLanguage` heuristic.

`${languageRule}` is one of:
- `uk` → `- Мова: українська, розмовна, жива. Як говорить автор, не як пишуть у підручниках.`
- `en` → `- Language: natural conversational English. Keep the creator voice and emotional tone.`

**System prompt:**

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

**User message** (`${languageHint}` = `Пиши всі поля відповіді українською.` / `Write all output fields in English.`):

```
Ось рент автора:

"""
${rant}
"""

Перетвори це на сценарій рілсу за вказаною структурою.
${languageHint}
```

---

### 3. Storytelling generation

- **File:** `lib/ai/rantToStories.ts` (`buildSystemPrompt`, `buildUserPrompt`)
- **Language:** same `detectOutputLanguage` heuristic.

`${languageRule}` is one of:
- `uk` → `Усі текстові поля пиши природною українською.`
- `en` → `Усі текстові поля (title, one_thought, screen_text, notes, reason) пиши природною розмовною англійською.`

**System prompt:**

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

**User message** (`${languageHint}` = `Виведи текстові поля українською.` / `Виведи текстові поля англійською.`):

```
${nameLine}

Брандамп:
"""
${rant}
"""

Створи сторітелінг за правилами вище. ${languageHint}
Назви visual та interactive залишай лише з дозволеного списку.
```

`${nameLine}` is `Назва сторітелінгу (емоційна ціль): ${name}` when a name is supplied,
otherwise `Назва сторітелінгу: (не задана — виведи ціль із брандампу)`.

---

### 4. Idea / angle proposals

- **File:** `lib/propose/proposeAngles.ts` (`SYSTEM_PROMPT`, `buildUserContent`)
- `${PROPOSAL_COUNT}` = `3` (from `lib/propose/types.ts`).
- **Note:** unlike 1–3, this prompt is language-independent (always Ukrainian).

**System prompt:**

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

**User message** is built by `buildUserContent(signals, exclude)`:

- With no signals: `Сигналів немає — акаунт новий. Запропонуй три сильні стартові кути для експертки, яка тільки починає вести контент.`
- With signals: `Сигнали:` followed by one line per signal, formatted as
  `- ОПУБЛІКОВАНО (${age}): «${label}»` / `- НЕВИКОРИСТАНИЙ ДАМП (${age}): «${label}»` /
  `- ЛЕЖИТЬ БЕЗ ДАТИ (${age}): «${label}»`
- When re-rolling, appends:
  `Ці кути вона вже бачила. Запропонуй ІНШІ — не переформульовуй ці, а зайди з іншого боку:`
  plus one `- ${title}` line per excluded title.

---

### 5. Transcript → reusable template

- **File:** `lib/ai/transcriptToTemplate.ts` (`SYSTEM_PROMPT`, `SYSTEM_PROMPT_BRIEF_ONLY`, `buildCreativeBriefUserContent`)
- Two attempts; the second appends a repair instruction.
- Uses `SYSTEM_PROMPT_BRIEF_ONLY` when the transcript is empty but a reference URL or author note exists.

**System prompt (normal):**

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

**System prompt (brief-only fallback):**

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

**Repair instruction appended to the user message on attempt 2:**

```
IMPORTANT REPAIR: Return JSON with key "scenes" only as an array of objects like {"text":"..."}. Minimum 3 non-empty scenes.
```

**User message** — reference URL, then author note, then transcript (note deliberately before
transcript), joined by blank lines, truncated: transcript to 14 000 chars, whole body to 20 000.

```
Референс-рілс: ${referenceUrl}

Нотатка автора: ${referenceNote}

Транскрипт референсу: ${transcript}
```

---

### 6. Scene splitting

- **File:** `lib/ai/sceneSegmentation.ts` (`splitTranscriptIntoScenes`)
- **Provider:** Gemini (`gemini-2.5-flash`), the only non-Groq inference call.
- Falls back to a heuristic (4 segments per scene) on any failure — so this call site
  degrades silently and is the lowest-risk to migrate.
- Single user message, no system role.

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
0. [0.00-2.50] ...
1. [2.50-5.10] ...
```

---

### 7–9. Whisper transcription

Three call sites, all Groq `whisper-large-v3-turbo`, all multipart form uploads to
`https://api.groq.com/openai/v1/audio/transcriptions`. **No prompt** — these send audio bytes.

Common form fields:

```
model=whisper-large-v3-turbo
response_format=verbose_json
temperature=0
language=<optional>
file=<binary>
```

| # | Function | Entry point | Notes |
|---|---|---|---|
| 7 | `transcribeAudioFile` | Braindump voice capture | Direct browser bytes, 25 MB cap |
| 8 | `transcribeMediaFromUrl` | Reel URL transcription | Server fetches the media itself — Groq's hosted URL fetch fails on IG/TikTok CDNs |
| 9 | `transcribeCompetitorMediaFromUrl` | Competitor scan | Same, plus 3 retries, 60 s timeout, concurrency 3; tagged `groq:whisper-large-v3-turbo` in the DB |

**Migration risk:** call site 9 records the provider string `groq:whisper-large-v3-turbo` into
`idea_scans` rows. Changing the provider changes that stored value — check whether anything
reads it before swapping.

---

## What the bake-off needs that does not exist yet

1. **Per-call-site model config.** `GROQ_TEXT_MODEL` is one global. If the bake-off picks
   different winners for carousel vs storytelling, `lib/ai/groqModel.ts` has to become a
   per-purpose map.
2. **`OPENROUTER_API_KEY`.** Not referenced anywhere in the codebase today.
3. **Kunj's test sets** — (raw braindump) + (his ideal finished result) + (the rules he applied),
   3–5 of them. See `scripts/bakeoff/testsets/README.md` for the format the harness reads.
