// Compile the project's Tailwind v4 utilities to a static CSS file so the editor
// HTML snapshots render with REAL layout (padding/flex/centering/text-align).
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.PROOF_DIR
  ? (process.env.PROOF_DIR.match(/^[A-Za-z]:|^[\\/]/) ? process.env.PROOF_DIR : join(process.cwd(), process.env.PROOF_DIR))
  : join(process.cwd(), '_proofout');
mkdirSync(OUT, { recursive: true });
const input = '@import "tailwindcss";';
const res = await postcss([tailwind()]).process(input, {
  from: join(process.cwd(), 'scripts', 'proof', '_in.css'),
});
writeFileSync(join(OUT, 'tw.css'), res.css);
console.log('tw.css bytes:', res.css.length);
