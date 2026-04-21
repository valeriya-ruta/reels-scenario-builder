'use client';

import type { SlidePlacement } from '@/lib/carouselTypes';

export default function PlacementToggle({
  value,
  onChange,
}: {
  value: SlidePlacement;
  onChange: (p: SlidePlacement) => void;
}) {
  const opts: { id: SlidePlacement; label: string; icon: string }[] = [
    { id: 'top', label: 'Зверху', icon: '/icons/placement/top.svg' },
    { id: 'center', label: 'По центру', icon: '/icons/placement/center.svg' },
    { id: 'bottom', label: 'Знизу', icon: '/icons/placement/bottom.svg' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={[
            'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition',
            value === o.id
              ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)]'
              : 'border-[color:var(--border)] bg-white hover:bg-[color:var(--surface)]',
          ].join(' ')}
          aria-label={o.label}
          title={o.label}
        >
          <img src={o.icon} alt="" aria-hidden="true" className="h-5 w-5" />
        </button>
      ))}
    </div>
  );
}
