// Screenshots each editor-N.html at 1080x1350, then composes it side-by-side
// with the matching export-N.png (editor | export) plus a divider + labels.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { readdirSync } from 'fs';
import { join } from 'path';

const DIR = '/tmp/proof';
const n = readdirSync(DIR).filter((f) => /^editor-\d+\.html$/.test(f)).length;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });

for (let i = 1; i <= n; i++) {
  await page.goto('file://' + join(DIR, `editor-${i}.html`));
  await page.waitForTimeout(1200); // let webfonts + tailwind CDN settle
  const el = await page.$('#root > *');
  await (el ?? page).screenshot({ path: join(DIR, `editor-${i}.png`) });

  const label = (text) =>
    Buffer.from(
      `<svg width="1080" height="56"><rect width="1080" height="56" fill="#111"/><text x="540" y="38" font-family="sans-serif" font-size="30" fill="#fff" text-anchor="middle">${text}</text></svg>`,
    );
  const labeled = async (src, text) =>
    sharp({ create: { width: 1080, height: 1406, channels: 3, background: '#111' } })
      .composite([
        { input: label(text), top: 0, left: 0 },
        { input: await sharp(src).resize(1080, 1350).png().toBuffer(), top: 56, left: 0 },
      ])
      .png()
      .toBuffer();

  const editorL = await labeled(join(DIR, `editor-${i}.png`), 'EDITOR (CarouselSlidePreview)');
  const exportL = await labeled(join(DIR, `export-${i}.png`), 'EXPORT (renderCarouselTemplatePng)');

  await sharp({ create: { width: 2176, height: 1406, channels: 3, background: '#333' } })
    .composite([
      { input: editorL, top: 0, left: 0 },
      { input: exportL, top: 0, left: 1096 },
    ])
    .png()
    .toFile(join(DIR, `compare-${i}.png`));
  console.log('compare-' + i + '.png');
}

await browser.close();
