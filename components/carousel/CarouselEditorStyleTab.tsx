'use client';

import Link from 'next/link';
import type { BrandAccentStyle, BrandSettings, BrandVibe } from '@/lib/brand';
import { normalizeHex } from '@/lib/brand';

const ACCENT_OPTIONS: { id: BrandAccentStyle; label: string }[] = [
  { id: 'marker', label: 'Маркер' },
  { id: 'pill', label: 'Пілюля' },
  { id: 'rectangle', label: 'Прямокутник' },
  { id: 'bold', label: 'Жирний' },
  { id: 'italic', label: 'Курсив' },
];

function VibeBadge({ vibe }: { vibe: BrandVibe }) {
  const label = vibe === 'refined' ? 'Редакційний' : 'Креативний';
  return (
    <span className="inline-flex rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-sm font-medium text-zinc-800">
      {label}
    </span>
  );
}

function AccentChipDemo({ style, color }: { style: BrandAccentStyle; color: string }) {
  const hex = normalizeHex(color);
  const base = 'inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-lg text-sm font-semibold';
  switch (style) {
    case 'italic':
      return (
        <span className={`${base} italic`} style={{ color: hex }}>
          А
        </span>
      );
    case 'pill':
      return (
        <span className={`${base} rounded-full px-2 text-white`} style={{ backgroundColor: hex }}>
          А
        </span>
      );
    case 'rectangle':
      return (
        <span className={`${base} border-2 px-1`} style={{ borderColor: hex, color: hex }}>
          А
        </span>
      );
    case 'marker':
      return (
        <span className={`${base} px-0.5`} style={{ color: hex, backgroundColor: `${hex}44` }}>
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

export default function CarouselEditorStyleTab({
  brand,
  accentDraft,
  onAccentDraft,
  watermarkDraft,
  onWatermarkDraft,
}: {
  brand: BrandSettings;
  accentDraft: BrandAccentStyle;
  onAccentDraft: (a: BrandAccentStyle) => void;
  watermarkDraft: string;
  onWatermarkDraft: (v: string) => void;
}) {
  const accentColor = brand.colors.accent1;

  return (
    <div className="space-y-6 pb-4">
      <p className="text-xs text-zinc-500">Застосовується до всіх слайдів</p>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Режим</label>
        <div className="flex flex-wrap items-center gap-3">
          <VibeBadge vibe={brand.vibe} />
          <Link
            href="/settings"
            className="text-sm font-medium text-[color:var(--accent)] underline-offset-2 hover:underline"
          >
            Змінити в Бренд DNA →
          </Link>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Стиль акценту</label>
        <div className="flex flex-wrap gap-2">
          {ACCENT_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onAccentDraft(o.id)}
              className={[
                'inline-flex min-w-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition',
                accentDraft === o.id
                  ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
                  : 'border-[color:var(--border)] bg-white text-zinc-700 hover:bg-[color:var(--surface)]',
              ].join(' ')}
            >
              <AccentChipDemo style={o.id} color={accentColor} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-zinc-500">Підпис</label>
        <input
          type="text"
          value={watermarkDraft}
          onChange={(e) => onWatermarkDraft(e.target.value)}
          placeholder="@username"
          className="w-full rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
        />
      </div>
    </div>
  );
}
