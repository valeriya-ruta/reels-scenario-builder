'use client';

import { hasAccentBraces } from '@/lib/accentBracketText';
import type { BrandAccentStyle } from '@/lib/brand';
import { AccentStyledSpans } from '@/components/carousel/AccentStyledSpans';

export default function AccentPreviewLine({
  value,
  baseColor,
  accentStyle,
  accentColor,
}: {
  value: string;
  baseColor: string;
  accentStyle: BrandAccentStyle;
  accentColor: string;
}) {
  if (!hasAccentBraces(value)) return null;

  return (
    <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
      <span className="text-zinc-400">Попередній перегляд: </span>
      <AccentStyledSpans
        text={value}
        baseColor={baseColor}
        accentStyle={accentStyle}
        accentColor={accentColor}
      />
    </p>
  );
}
