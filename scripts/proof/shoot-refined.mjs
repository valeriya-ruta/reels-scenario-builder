// Screenshots each editor-N.html at 1080x1350 in the system Chrome, then composes
// it side-by-side with the matching export PNG (editor | export) + labels.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.env.PROOF_DIR
  ? (process.env.PROOF_DIR.match(/^[A-Za-z]:|^[\\/]/) ? process.env.PROOF_DIR : join(process.cwd(), process.env.PROOF_DIR))
  : join(process.cwd(), '_proofout');
const CHROME =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const editors = readdirSync(DIR)
  .filter((f) => /^editor-\d+-[a-z]+\.html$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });

for (const editorHtml of editors) {
  const stem = editorHtml.replace(/^editor-/, '').replace(/\.html$/, ''); // e.g. 1-cover
  await page.goto('file://' + join(DIR, editorHtml).replace(/\\/g, '/'));
  await page.waitForTimeout(1000); // let webfonts settle
  const el = await page.$('#root > *');
  await (el ?? page).screenshot({ path: join(DIR, `editor-${stem}.png`) });

  const label = (text) =>
    Buffer.from(
      `<svg width="1080" height="56"><rect width="1080" height="56" fill="#111"/><text x="540" y="38" font-family="sans-serif" font-size="28" fill="#fff" text-anchor="middle">${text}</text></svg>`,
    );
  const labeled = async (src, text) =>
    sharp({ create: { width: 1080, height: 1406, channels: 3, background: '#111' } })
      .composite([
        { input: label(text), top: 0, left: 0 },
        { input: await sharp(src).resize(1080, 1350).png().toBuffer(), top: 56, left: 0 },
      ])
      .png()
      .toBuffer();

  const editorL = await labeled(join(DIR, `editor-${stem}.png`), `EDITOR — ${stem}`);
  const exportL = await labeled(join(DIR, `export-${stem}.png`), `EXPORT — ${stem}`);

  await sharp({ create: { width: 2176, height: 1406, channels: 3, background: '#333' } })
    .composite([
      { input: editorL, top: 0, left: 0 },
      { input: exportL, top: 0, left: 1096 },
    ])
    .png()
    .toFile(join(DIR, `compare-${stem}.png`));
  console.log('compare-' + stem + '.png');
}

await browser.close();
