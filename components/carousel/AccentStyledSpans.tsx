'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { BrandAccentStyle } from '@/lib/brand';
import { normalizeHex } from '@/lib/brand';
import { parseAccentSpans } from '@/lib/carousel/accentSpans';

/** Single `{…}` accent run — same styling as canvas / carousel preview. */
export function AccentSpan({
  style,
  accentColor,
  children,
}: {
  style: BrandAccentStyle;
  accentColor: string;
  children: ReactNode;
}) {
  const hex = normalizeHex(accentColor);
  switch (style) {
    case 'italic':
      return (
        <span className="italic" style={{ color: hex }}>
          {children}
        </span>
      );
    case 'pill':
      return (
        <span
          className="inline-block rounded-full px-1.5 py-0.5 text-[0.95em] font-medium text-white"
          style={{ backgroundColor: hex }}
        >
          {children}
        </span>
      );
    case 'rectangle':
      return (
        <span
          className="inline-block border px-1 py-px text-[0.95em] font-medium"
          style={{ borderColor: hex, color: hex }}
        >
          {children}
        </span>
      );
    case 'marker':
      return (
        <span
          className="font-medium"
          style={{
            color: hex,
            backgroundColor: `${hex}55`,
          }}
        >
          {children}
        </span>
      );
    case 'bold':
    default:
      return (
        <span className="font-bold" style={{ color: hex }}>
          {children}
        </span>
      );
  }
}

/** Renders `{accent}` spans with Brand DNA accent_style (same rules as canvas / `parseAccentSpans`). */
export function AccentStyledSpans({
  text,
  baseColor,
  accentStyle,
  accentColor,
  className,
  style,
}: {
  text: string;
  baseColor: string;
  accentStyle: BrandAccentStyle;
  accentColor: string;
  className?: string;
  style?: CSSProperties;
}) {
  const segments = parseAccentSpans(text);
  return (
    <span className={className} style={style}>
      {segments.map((seg, i) =>
        seg.isAccent ? (
          <AccentSpan key={i} style={accentStyle} accentColor={accentColor}>
            {seg.text}
          </AccentSpan>
        ) : (
          <span key={i} style={{ color: baseColor }}>
            {seg.text}
          </span>
        ),
      )}
    </span>
  );
}
