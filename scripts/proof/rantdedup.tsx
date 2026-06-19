// Verifies idea→reel generation yields EXACTLY one hook (first) + one CTA (last),
// driving the REAL transformRantToScript with a stubbed Groq fetch so we exercise
// the actual flatten + de-dupe path (task 86d3dcn4d). No network / API key needed.
process.env.GROQ_API_KEY = 'test-key';

import { transformRantToScript } from '@/lib/ai/rantToScript';

type Groq = { title: string; hook: string; cta: string; scenes: { id?: number; label?: string; text?: string }[] };

function stub(resp: Groq) {
  // @ts-expect-error override for test
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(resp) } }] }),
    text: async () => '',
  });
}

const RANT_UK = 'Я роками вигорав на роботі поки не зрозумів одну річ про відпочинок і тепер хочу поділитися';
const RANT_EN = 'I burned out for years at work until I realized one thing about rest and now I want to share it with everyone here';

// Three different "generations", each reproducing a way the model doubles things.
const cases: { name: string; rant: string; resp: Groq }[] = [
  {
    name: 'gen1 — model repeats hook & CTA as labeled scenes (the classic doubling)',
    rant: RANT_UK,
    resp: {
      title: 'Вигорання',
      hook: 'Ти не лінивий — ти виснажений.',
      cta: 'Збережи цей рілс, щоб не забути.',
      scenes: [
        { id: 1, label: 'ХУК', text: 'Ти не лінивий — ти виснажений.' },
        { id: 2, label: 'Проблема', text: 'Ти працюєш на автоматі вже місяці.' },
        { id: 3, label: 'Поворот', text: 'Відпочинок — це не нагорода.' },
        { id: 4, label: 'Рішення', text: 'Плануй паузи як зустрічі.' },
        { id: 5, label: 'CTA', text: 'Збережи цей рілс, щоб не забути.' },
      ],
    },
  },
  {
    name: 'gen2 — hook/CTA repeated in scenes with neutral labels (matched by text)',
    rant: RANT_UK,
    resp: {
      title: 'Пауза',
      hook: 'Вигорання починається тихо.',
      cta: 'Напиши в коментарях своє правило відпочинку.',
      scenes: [
        { id: 1, label: 'Вступ', text: 'Вигорання починається тихо.' },
        { id: 2, label: 'Проблема', text: 'Ти й не помічаєш, як втрачаєш інтерес.' },
        { id: 3, label: 'Інсайт', text: 'Тіло просить паузу задовго до зриву.' },
        { id: 4, label: 'Заклик', text: 'Напиши в коментарях своє правило відпочинку.' },
      ],
    },
  },
  {
    name: 'gen3 — clean model output (no doubling) stays intact',
    rant: RANT_EN,
    resp: {
      title: 'Rest',
      hook: 'You are not lazy. You are depleted.',
      cta: 'Save this so you remember tonight.',
      scenes: [
        { id: 1, label: 'Problem', text: 'You push through every single day.' },
        { id: 2, label: 'Insight', text: 'Rest is maintenance, not a reward.' },
        { id: 3, label: 'Solution', text: 'Schedule breaks like real meetings.' },
      ],
    },
  },
];

function isHook(name: string | null | undefined) {
  return name === 'ХУК' || name === 'HOOK';
}
function isCta(name: string | null | undefined) {
  return name === 'CTA';
}

async function main() {
  let allPass = true;
  for (const c of cases) {
    stub(c.resp);
    const { scenes } = await transformRantToScript(c.rant);
    const hookCount = scenes.filter((s) => isHook(s.name)).length;
    const ctaCount = scenes.filter((s) => isCta(s.name)).length;
    const firstIsHook = isHook(scenes[0]?.name);
    const lastIsCta = isCta(scenes[scenes.length - 1]?.name);
    // No middle scene may equal the hook/CTA text.
    const hookText = c.resp.hook.toLowerCase();
    const ctaText = c.resp.cta.toLowerCase();
    const dupInMiddle = scenes
      .slice(1, -1)
      .some((s) => s.text.toLowerCase() === hookText || s.text.toLowerCase() === ctaText);

    const pass = hookCount === 1 && ctaCount === 1 && firstIsHook && lastIsCta && !dupInMiddle;
    allPass = allPass && pass;
    console.log(`\n${pass ? '✅' : '❌'} ${c.name}`);
    console.log(`   scenes (${scenes.length}): ${scenes.map((s) => s.name ?? '—').join(' | ')}`);
    console.log(`   hookCount=${hookCount} ctaCount=${ctaCount} firstIsHook=${firstIsHook} lastIsCta=${lastIsCta} dupInMiddle=${dupInMiddle}`);
  }
  console.log(`\n${allPass ? 'ALL PASS' : 'FAILURES PRESENT'}`);
  if (!allPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
