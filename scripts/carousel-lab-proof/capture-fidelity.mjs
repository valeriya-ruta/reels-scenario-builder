// Fidelity + parity capture harness (temp script; run with node from project root).
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const PROOF = join(ROOT, 'carousel-lab-proof');
const REF = join(PROOF, 'svg-reference');
const RENDER = join(PROOF, 'render');
const EXPORT = join(PROOF, 'export');
const SBS = join(PROOF, 'side-by-side');
for (const d of [RENDER, EXPORT, SBS]) mkdirSync(d, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1120, height: 1600 }, deviceScaleFactor: 1 });
let lastNav = Date.now();
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()); });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) lastNav = Date.now(); });

async function waitStable(quietMs = 3000, maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (Date.now() - lastNav >= quietMs) return;
    await page.waitForTimeout(300);
  }
}
async function ensureReady() {
  await page.waitForFunction(() => Array.isArray(window.__labKeys) && typeof window.__labExportPng === 'function', { timeout: 30000 });
  await page.waitForFunction(() => {
    const els = document.querySelectorAll('[data-testid^="ed-"]');
    return els.length > 0 && Array.from(els).every((e) => e.getAttribute('data-slide-ready') === '1' && e.querySelector('svg'));
  }, { timeout: 30000 });
}
async function retry(fn, label) {
  for (let i = 0; i < 6; i++) {
    try { return await fn(); }
    catch (e) {
      if (!/context was destroyed|Execution context|navigation/.test(String(e))) throw e;
      console.log(`  retry ${label} (${i + 1})`);
      await page.waitForTimeout(1000);
      await ensureReady();
    }
  }
  throw new Error('retry exhausted: ' + label);
}

await page.goto('http://localhost:3001/lab-preview', { waitUntil: 'load' });
await waitStable(3000, 30000); // wait out the one-time dev/auth settle reload
await ensureReady();

const keys = await retry(() => page.evaluate(() => window.__labKeys), 'keys');
const refs = await retry(() => page.evaluate(() => window.__labRefs), 'refs');

function decodeDataUrl(d) {
  const b64 = d.split(',')[1];
  return Buffer.from(b64, 'base64');
}

async function meanAbsDiff(aBuf, bBuf) {
  // resize both to 360x450, compare raw RGB
  const A = await sharp(aBuf).resize(360, 450, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const B = await sharp(bBuf).resize(360, 450, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  let sum = 0;
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) sum += Math.abs(A[i] - B[i]);
  return sum / n; // 0..255
}

const results = [];
for (const key of keys) {
  const renderBuf = await retry(() => page.locator(`[data-testid="ed-${key}"]`).screenshot(), `shot ${key}`);
  writeFileSync(join(RENDER, `${key}.png`), renderBuf);

  const dataUrl = await retry(() => page.evaluate((k) => window.__labExportPng(k), key), `export ${key}`);
  let exportBuf = null;
  if (dataUrl) {
    exportBuf = decodeDataUrl(dataUrl);
    writeFileSync(join(EXPORT, `${key}.png`), exportBuf);
  }

  const refPath = join(REF, refs[key]);
  const refExists = existsSync(refPath);
  const parity = exportBuf ? await meanAbsDiff(renderBuf, exportBuf) : null;
  const fidelity = refExists ? await meanAbsDiff(renderBuf, refPath) : null;
  results.push({ key, parity, fidelity });

  // side-by-side strip: reference | editor | export
  const cellW = 360, cellH = 450;
  const cells = [];
  if (refExists) cells.push(await sharp(refPath).resize(cellW, cellH, { fit: 'fill' }).toBuffer());
  else cells.push(await sharp({ create: { width: cellW, height: cellH, channels: 3, background: '#444' } }).png().toBuffer());
  cells.push(await sharp(renderBuf).resize(cellW, cellH, { fit: 'fill' }).toBuffer());
  if (exportBuf) cells.push(await sharp(exportBuf).resize(cellW, cellH, { fit: 'fill' }).toBuffer());
  const strip = await sharp({ create: { width: cellW * cells.length, height: cellH, channels: 3, background: '#000' } })
    .composite(cells.map((c, i) => ({ input: c, left: i * cellW, top: 0 })))
    .png().toBuffer();
  writeFileSync(join(SBS, `${key}.png`), strip);
}

await browser.close();

console.log('\nkey                              parity(→0)  fidelity(→0)');
for (const r of results) {
  console.log(
    r.key.padEnd(32),
    (r.parity == null ? '  n/a ' : r.parity.toFixed(2).padStart(6)),
    '    ',
    (r.fidelity == null ? ' n/a' : r.fidelity.toFixed(2).padStart(6)),
  );
}
writeFileSync(join(PROOF, 'metrics.json'), JSON.stringify(results, null, 2));
console.log('\nwrote', join(PROOF, 'metrics.json'));
