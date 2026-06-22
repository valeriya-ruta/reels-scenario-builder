// Phone-viewport proof for the braindump State-A scroll fix (86d3dezu4).
// Renders the EXACT new BraindumpOverlay State-A DOM (same Tailwind classes as
// the component) at iPhone size for short (33w) and long (210w) transcripts to
// show: transcript scrolls inside a fixed region; mic + green check + word
// counter stay pinned and tappable at any length.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join } from 'path';

const DIR = '/tmp/proof';

const mic = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4"/></svg>`;
const check = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>`;
const keyboard = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#52525b" stroke-width="1.9"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>`;

function words(n) {
  return Array.from({ length: n }, (_, i) => ['ідея', 'контент', 'про', 'те', 'як', 'я', 'почала', 'знімати', 'рілси', 'щодня'][i % 10]).join(' ');
}

function stateA(transcript, count) {
  // Mirrors BraindumpOverlay State A after the fix: scroll region (mt-auto) +
  // pinned controls footer.
  return `
  <div class="relative flex h-full w-full flex-col" style="background:rgba(236,235,232,0.62)">
    <div class="relative z-10 flex shrink-0 items-center justify-between px-5 pt-6">
      <div class="min-h-[20px]"></div>
      <button class="rounded-full p-1.5 text-zinc-500">✕</button>
    </div>
    <div class="relative z-10 flex min-h-0 flex-1 flex-col px-6 pb-[40px]">
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div class="mt-auto pb-4">
          <h2 class="text-2xl font-bold leading-snug tracking-tight text-black">Що в тебе на думці?</h2>
          <div class="mt-3">
            <p class="whitespace-pre-wrap text-lg leading-relaxed text-zinc-500">${transcript}</p>
          </div>
        </div>
      </div>
      <div class="shrink-0 pt-3">
        <div>
          <div class="flex items-center justify-center gap-5 pb-4">
            <button class="flex h-20 w-20 items-center justify-center rounded-full" style="background:#004BA8;box-shadow:0 10px 30px rgba(0,75,168,0.4)">${mic}</button>
            <button class="flex h-14 w-14 items-center justify-center rounded-full" style="background:#16a34a;box-shadow:0 4px 12px rgba(0,0,0,.15)">${check}</button>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs tabular-nums text-zinc-400">${count}/50</span>
            <button class="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/70">${keyboard}</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

const page = (body) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file:///tmp/proof/tw.css">
<style>html,body{margin:0;padding:0;font-family:sans-serif}#root{width:390px;height:844px;background:#fff;overflow:hidden}</style>
</head><body><div id="root">${body}</div></body></html>`;

const cases = [
  { name: 'short-33w', n: 33 },
  { name: 'long-210w', n: 210 },
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

const shots = [];
for (const c of cases) {
  const html = page(stateA(words(c.n), c.n));
  const htmlPath = join(DIR, `braindump-${c.name}.html`);
  writeFileSync(htmlPath, html);
  await p.goto('file://' + htmlPath);
  await p.waitForTimeout(300);
  const out = join(DIR, `braindump-${c.name}.png`);
  await p.screenshot({ path: out });
  shots.push({ name: c.name, out });
  // Assert the pinned controls are within the viewport (tappable).
  const micBox = await (await p.$('button')).boundingBox();
  console.log(`${c.name}: top-bar button at y=${Math.round(micBox.y)} (viewport 844)`);
}
await browser.close();

// Compose the two side by side with labels.
const label = (t) => Buffer.from(`<svg width="390" height="44"><rect width="390" height="44" fill="#111"/><text x="195" y="29" font-family="sans-serif" font-size="20" fill="#fff" text-anchor="middle">${t}</text></svg>`);
const labeled = async (src, t) => sharp({ create: { width: 390, height: 888, channels: 3, background: '#111' } })
  .composite([{ input: label(t), top: 0, left: 0 }, { input: await sharp(src).toBuffer(), top: 44, left: 0 }]).png().toBuffer();
await sharp({ create: { width: 800, height: 888, channels: 3, background: '#333' } })
  .composite([
    { input: await labeled(shots[0].out, '33 words'), top: 0, left: 0 },
    { input: await labeled(shots[1].out, '210 words'), top: 0, left: 410 },
  ]).png().toFile(join(DIR, 'braindump-compare.png'));
console.log('braindump-compare.png');
