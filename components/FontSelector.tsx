'use client';

import { BRAND_FONTS } from '@/lib/brandFonts';

export interface FontSelectorProps {
  selectedFontId: string;
  onChange: (fontId: string) => void;
  accentColor: string;
}

export function FontSelector({ selectedFontId, onChange, accentColor }: FontSelectorProps) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5">
      <p className="mb-3 text-sm font-medium text-zinc-900">Шрифт бренду</p>
      <div className="grid grid-cols-2 gap-2">
        {BRAND_FONTS.map((font) => {
          const selected = font.id === selectedFontId;
          return (
            <button
              key={font.id}
              type="button"
              onClick={() => onChange(font.id)}
              className={[
                'rounded-xl border bg-white p-3 text-left transition',
                selected ? '' : 'border-[color:var(--border)] hover:bg-[color:var(--surface)]',
              ].join(' ')}
              style={{
                borderColor: selected ? accentColor : undefined,
                borderWidth: selected ? 2 : 1,
              }}
            >
              <p
                className="text-lg leading-tight text-zinc-900"
                style={{
                  fontFamily: `'${font.label}', sans-serif`,
                  fontWeight: font.titleWeight,
                  fontStyle: font.titleStyle,
                }}
              >
                {font.label}
              </p>
              {/* Description renders in the app's body/UI font (Google Sans via
                  --font-sans), NOT the pairing's own face — the human-language
                  explanation should read in the UI font; only the NAME above is a
                  sample of the pairing. */}
              <p
                className="mt-1 text-sm text-zinc-600"
                style={{ fontFamily: 'var(--font-sans)', fontWeight: 400 }}
              >
                {font.previewText}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
