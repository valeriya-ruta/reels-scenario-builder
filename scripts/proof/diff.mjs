// Quantifies editor-vs-export drift: for each slide, the share of pixels whose
// colour differs beyond a perceptual threshold, plus the bounding box of the
// drift so a report can say WHERE the two disagree, not just that they do.
//
// "The code path ran" is not acceptance for a render change — this is.
//
//   node scripts/proof/diff.mjs            # reads _proofout
//   PROOF_DIR=_proofout_bold node scripts/proof/diff.mjs
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.env.PROOF_DIR
  ? process.env.PROOF_DIR.match(/^[A-Za-z]:|^[\\/]/)
    ? process.env.PROOF_DIR
    : join(process.cwd(), process.env.PROOF_DIR)
  : join(process.cwd(), '_proofout');

// Per-channel tolerance. Anti-aliasing and JPEG-free PNG resampling routinely
// move a pixel by a few units; a real layout difference moves it far more.
const TOLERANCE = Number(process.env.DIFF_TOLERANCE ?? 24);
const W = 1080;
const H = 1350;

const stems = readdirSync(DIR)
  .filter((f) => /^export-\d+-[a-z]+\.png$/.test(f))
  .map((f) => f.replace(/^export-/, '').replace(/\.png$/, ''))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const raw = async (file) =>
  sharp(join(DIR, file)).resize(W, H).removeAlpha().raw().toBuffer();

let worst = 0;
for (const stem of stems) {
  const [a, b] = await Promise.all([raw(`editor-${stem}.png`), raw(`export-${stem}.png`)]);

  let differing = 0;
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  // Per-row differing counts: a layout shift concentrates in a band, while
  // antialiasing noise spreads thinly across every row that carries glyphs.
  const rows = new Uint32Array(H);
  const heat = Buffer.alloc(W * H * 3);

  for (let i = 0, px = 0; i < a.length; i += 3, px++) {
    const d =
      Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    const x = px % W;
    const y = (px / W) | 0;
    if (d <= TOLERANCE) {
      // Keep a dim version of the editor pixel as context under the heat.
      heat[i] = a[i] >> 2;
      heat[i + 1] = a[i + 1] >> 2;
      heat[i + 2] = a[i + 2] >> 2;
      continue;
    }
    differing++;
    rows[y]++;
    heat[i] = 255;
    heat[i + 1] = d > 200 ? 0 : 140;
    heat[i + 2] = 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  await sharp(heat, { raw: { width: W, height: H, channels: 3 } })
    .png()
    .toFile(join(DIR, `diff-${stem}.png`));

  // The densest 24px band — where the two renderers disagree MOST.
  let bandStart = 0;
  let bandBest = 0;
  for (let y = 0; y + 24 < H; y++) {
    let sum = 0;
    for (let k = 0; k < 24; k++) sum += rows[y + k];
    if (sum > bandBest) {
      bandBest = sum;
      bandStart = y;
    }
  }

  const pct = (differing / (W * H)) * 100;
  worst = Math.max(worst, pct);
  const where = maxX < 0 ? '—' : `x ${minX}–${maxX}, y ${minY}–${maxY}`;
  const band = bandBest > 0 ? `hottest band y ${bandStart}–${bandStart + 24}` : '—';
  console.log(`${stem.padEnd(12)} ${pct.toFixed(3).padStart(7)}%   ${where}   ${band}`);
}

console.log(`\nworst: ${worst.toFixed(3)}%  (tolerance ${TOLERANCE}/765 per pixel)`);
