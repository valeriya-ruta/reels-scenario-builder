import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';
import { join } from 'path';
const OUT = join(process.cwd(), 'carousel-lab-proof', 'editor-clone');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function run(label, viewport, mobile) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  let lastNav = Date.now();
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) lastNav = Date.now(); });
  page.on('pageerror', (e) => console.log(`[${label} pageerror]`, e.message));
  await page.goto('http://localhost:3001/lab-demo', { waitUntil: 'load' });
  const start = Date.now();
  while (Date.now() - start < 25000) { if (Date.now() - lastNav >= 2500) break; await page.waitForTimeout(300); }
  await page.waitForSelector('[data-testid="active-preview"][data-slide-ready="1"] svg', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${label}-01-editor.png`) });

  // open Тип tab
  const tabSel = mobile ? '[data-testid="tab-type"]' : '[data-testid="tab-d-type"]';
  await page.click(tabSel, { force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, `${label}-02-type-tab.png`) });

  // switch group to Цифри
  await page.getByRole('button', { name: 'Цифри' }).click({ force: true });
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${label}-03-numbers-group.png`) });

  // open Текст tab
  const textSel = mobile ? '[data-testid="tab-text"]' : '[data-testid="tab-d-text"]';
  await page.click(textSel, { force: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${label}-04-text-tab.png`) });
  console.log(label, 'done');
  await page.close();
}

await run('mobile', { width: 390, height: 844 }, true);
await run('desktop', { width: 1440, height: 900 }, false);
await browser.close();
