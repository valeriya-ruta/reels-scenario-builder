'use client';

import type { BrandAccentStyle } from '@/lib/brand';
import { normalizeHex } from '@/lib/brand';

function AccentGlyph({
  style,
  accentColor,
}: {
  style: BrandAccentStyle;
  accentColor: string;
}) {
  const hex = normalizeHex(accentColor);
  const base = 'inline-flex items-center justify-center text-sm leading-none tabular-nums';

  switch (style) {
    case 'italic':
      return (
        <span className={`${base} italic font-semibold`} style={{ color: hex }}>
          А
        </span>
      );
    case 'pill':
      return (
        <span
          className={`${base} rounded-full px-1.5 py-0.5 text-[13px] font-semibold text-white`}
          style={{ backgroundColor: hex }}
        >
          А
        </span>
      );
    case 'rectangle':
      return (
        <span
          className={`${base} border-2 px-1 py-px text-[13px] font-semibold`}
          style={{ borderColor: hex, color: hex }}
        >
          А
        </span>
      );
    case 'marker':
      return (
        <span
          className={`${base} px-0.5 text-[13px] font-semibold`}
          style={{
            color: hex,
            backgroundColor: `${hex}55`,
          }}
        >
          А
        </span>
      );
    case 'bold':
    default:
      return (
        <span className={`${base} font-bold`} style={{ color: hex }}>
          А
        </span>
      );
  }
}

export default function TextToolbar({
  canApply,
  onAccent,
  accentStyle,
  accentColor,
}: {
  canApply: boolean;
  onAccent: () => void;
  accentStyle: BrandAccentStyle;
  accentColor: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-1">
      <button
        type="button"
        disabled={!canApply}
        title="Виділи текст і натисни, щоб додати акцент"
        onClick={(e) => {
          e.stopPropagation();
          onAccent();
        }}
        className={[
          'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border text-zinc-800 transition',
          canApply
            ? 'border-[color:var(--border)] bg-white hover:bg-[color:var(--surface)] active:scale-[0.97]'
            : 'cursor-not-allowed border-zinc-100 bg-zinc-50/80 opacity-45',
        ].join(' ')}
        aria-label="Акцент"
      >
        <AccentGlyph style={accentStyle} accentColor={accentColor} />
      </button>
    </div>
  );
}
