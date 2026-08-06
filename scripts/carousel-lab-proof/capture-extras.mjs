import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const PROOF = join(process.cwd(), 'carousel-lab-proof');
const EXTRAS = join(PROOF, 'extras');
mkdirSync(EXTRAS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1600 } });
let lastNav = Date.now();
page.on('framenavigated', (f) => { if (f === page.mainFrame()) lastNav = Date.now(); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

async function waitStable(q = 3000, max = 30000) {
  const s = Date.now();
  while (Date.now() - s < max) { if (Date.now() - lastNav >= q) return; await page.waitForTimeout(300); }
}
async function ensureReady() {
  await page.waitForFunction(() => Array.isArray(window.__labExtraKeys) && typeof window.__labExtraExportPng === 'function', { timeout: 30000 });
  await page.waitForFunction(() => {
    const els = document.querySelectorAll('[data-testid^="ex-"]');
    return els.length > 0 && Array.from(els).every((e) => e.getAttribute('data-slide-ready') === '1' && e.querySelector('svg'));
  }, { timeout: 30000 });
}
async function retry(fn, label) {
  for (let i = 0; i < 8; i++) {
    try { return await fn(); } catch (e) {
      if (!/context was destroyed|Execution context|navigation|Timeout/.test(String(e))) throw e;
      await waitStable(2000, 20000); await ensureReady();
    }
  }
  throw new Error('retry exhausted ' + label);
}

await page.goto('http://localhost:3001/lab-proof', { waitUntil: 'load' });
await waitStable();
await ensureReady();

const keys = await retry(() => page.evaluate(() => window.__labExtraKeys), 'keys');
function decode(d) { return Buffer.from(d.split(',')[1], 'base64'); }

for (const key of keys) {
  const renderBuf = await retry(() => page.locator(`[data-testid="ex-${key}"]`).screenshot(), `shot ${key}`);
  writeFileSync(join(EXTRAS, `${key}-editor.png`), renderBuf);
  const dataUrl = await retry(() => page.evaluate((k) => window.__labExtraExportPng(k), key), `export ${key}`);
  const cells = [await sharp(renderBuf).resize(360, 450, { fit: 'fill' }).toBuffer()];
  if (dataUrl) {
    const exp = decode(dataUrl);
    writeFileSync(join(EXTRAS, `${key}-export.png`), exp);
    cells.push(await sharp(exp).resize(360, 450, { fit: 'fill' }).toBuffer());
  }
  const strip = await sharp({ create: { width: 360 * cells.length, height: 450, channels: 3, background: '#000' } })
    .composite(cells.map((c, i) => ({ input: c, left: i * 360, top: 0 }))).png().toBuffer();
  writeFileSync(join(EXTRAS, `${key}-sbs.png`), strip);
  console.log('captured', key);
}
await browser.close();
