// Drives the real LabEditor at /lab-demo (no auth) to prove editor UX + pickers +
// live preview + export button. Saves screenshots + the editor-exported PNG.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'carousel-lab-proof', 'editor');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let lastNav = Date.now();
page.on('framenavigated', (f) => { if (f === page.mainFrame()) lastNav = Date.now(); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
async function waitStable(q = 2500, max = 25000) {
  const s = Date.now();
  while (Date.now() - s < max) { if (Date.now() - lastNav >= q) return; await page.waitForTimeout(300); }
}

await page.goto('http://localhost:3001/lab-demo', { waitUntil: 'load' });
await waitStable();
await page.waitForSelector('[data-testid="active-preview"][data-slide-ready="1"] svg', { timeout: 30000 });

function svgText() {
  return page.locator('[data-testid="active-preview"] svg').innerHTML();
}

// 1) initial state screenshot (cover slide + pickers)
await page.screenshot({ path: join(OUT, '01-initial.png') });
const initialType = await page.locator('button:has-text("Обкладинка")').first().getAttribute('style');
console.log('initial cover picker present:', !!initialType);

// 2) switch slide type to "Цифри" (numbers) via the type picker
await page.getByRole('button', { name: 'Цифри' }).click();
await page.waitForTimeout(400);
await page.waitForSelector('[data-testid="active-preview"][data-slide-ready="1"] svg');
const afterTypeSwitch = await svgText();
console.log('after type→numbers, preview has a big number text el:', /font-size="(140|210|2[0-9][0-9])"/.test(afterTypeSwitch));
await page.screenshot({ path: join(OUT, '02-type-switched-numbers.png') });

// 3) go back to a text slide via filmstrip and edit the title field → preview updates live
await page.locator('[data-testid="thumb-1"]').click({ force: true });
await page.waitForTimeout(500);
const titleField = page.getByRole('textbox').nth(1);
await titleField.fill('ЖИВЕ ОНОВЛЕННЯ ПРЕВʼЮ');
await page.waitForTimeout(500);
const liveHtml = await svgText();
console.log('live preview reflects typed title:', /ЖИВЕ ОНОВЛЕННЯ/.test(liveHtml));
await page.screenshot({ path: join(OUT, '03-live-edit.png') });

// 4) style chooser present + selected
const styleSelected = await page.locator('button:has-text("Modern Elegant")').first().isVisible();
console.log('style chooser shows Modern Elegant:', styleSelected);

// 5) export the active slide via the editor button → capture the download PNG
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.getByRole('button', { name: 'Експорт слайду' }).click({ force: true }),
]);
const p = join(OUT, 'editor-exported-slide.png');
await download.saveAs(p);
console.log('editor export download saved:', download.suggestedFilename());

await browser.close();
console.log('DONE editor demo capture');
