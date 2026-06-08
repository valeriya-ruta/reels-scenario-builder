// Compile the project's Tailwind v4 utilities to a static CSS file so the editor
// HTML snapshots render with REAL layout (padding/flex/centering/text-align),
// instead of relying on the network-blocked Tailwind Play CDN.
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { writeFileSync } from 'fs';

const input = '@import "tailwindcss";';
const res = await postcss([tailwind()]).process(input, {
  from: process.cwd() + '/scripts/proof/_in.css',
});
writeFileSync('/tmp/proof/tw.css', res.css);
console.log('tw.css bytes:', res.css.length);
