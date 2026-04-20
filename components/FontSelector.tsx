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
              <p
                className="mt-1 text-sm text-zinc-600"
                style={{
                  fontFamily: `'${font.label}', sans-serif`,
                  fontWeight: font.bodyAvailable ? font.bodyWeight : '400',
                  fontStyle: 'normal',
                }}
              >
                {font.previewText}
              </p>
              {!font.bodyAvailable && (
                <span className="mt-2 inline-block rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                  лише заголовки
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
