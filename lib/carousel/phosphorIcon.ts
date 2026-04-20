import { readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { loadImage, type Image } from '@napi-rs/canvas';

/** Maps AI `icon` field to Phosphor asset filename (without .svg). */
const ICON_FILE: Record<string, string> = {
  image: 'image',
  lightning: 'lightning',
  star: 'star',
  check: 'check',
  'arrow-right': 'arrow-right',
  clock: 'clock',
  calendar: 'calendar',
  fire: 'fire',
  sparkle: 'sparkle',
  target: 'target',
  camera: 'camera',
  pen: 'pen',
  chart: 'chart-line',
  heart: 'heart',
  globe: 'globe',
};

export async function rasterizePhosphorIcon(
  name: string | undefined | null,
  size: number,
  colorHex: string,
): Promise<Image | null> {
  if (!name) return null;
  const file = ICON_FILE[name.trim()] ?? ICON_FILE.chart;
  const svgPath = join(process.cwd(), 'public', 'icons', 'phosphor', `${file}.svg`);
  try {
    let svg = await readFile(svgPath, 'utf8');
    svg = svg.replace(/currentColor/g, colorHex);
    const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
    return loadImage(buf);
  } catch (e) {
    console.warn('[carousel] phosphor icon failed:', name, e);
    return null;
  }
}
