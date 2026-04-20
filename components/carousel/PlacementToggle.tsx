'use client';

import type { SlidePlacement } from '@/lib/carouselTypes';

export default function PlacementToggle({
  value,
  onChange,
}: {
  value: SlidePlacement;
  onChange: (p: SlidePlacement) => void;
}) {
  const opts: { id: SlidePlacement; label: string }[] = [
    { id: 'top', label: 'Зверху' },
    { id: 'center', label: 'По центру' },
    { id: 'bottom', label: 'Знизу' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={[
            'rounded-lg border px-3 py-1.5 text-xs font-medium transition',
            value === o.id
              ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
              : 'border-[color:var(--border)] bg-white text-zinc-700 hover:bg-[color:var(--surface)]',
          ].join(' ')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
