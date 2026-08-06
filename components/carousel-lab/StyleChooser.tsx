'use client';

import type { LabStyleId } from '@/lib/carousel-lab/types';
import { createSlide } from '@/lib/carousel-lab/defaults';
import LabSlideCanvas from './LabSlideCanvas';

// One style now; the array is the slot-in point for future styles.
const STYLES: { id: LabStyleId | string; name: string; enabled: boolean }[] = [
  { id: 'modern-elegant', name: 'Modern Elegant', enabled: true },
  { id: 'soon-1', name: 'Скоро', enabled: false },
  { id: 'soon-2', name: 'Скоро', enabled: false },
];

const PREVIEW = { ...createSlide('cover', 'title'), title: 'Modern Elegant' };

export default function StyleChooser({
  value,
  onSelect,
}: {
  value: LabStyleId;
  onSelect: (id: LabStyleId) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-neutral-500">Стиль каруселі</div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory' }}>
        {STYLES.map((s) => {
          const selected = value === s.id;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!s.enabled}
              onClick={() => s.enabled && onSelect(s.id as LabStyleId)}
              className="shrink-0 rounded-xl border p-1.5 text-left transition"
              style={{
                scrollSnapAlign: 'start',
                width: 132,
                borderColor: selected ? '#4a6cf7' : '#e5e5e5',
                boxShadow: selected ? '0 0 0 2px #4a6cf7' : 'none',
                opacity: s.enabled ? 1 : 0.5,
                cursor: s.enabled ? 'pointer' : 'not-allowed',
                background: '#fff',
              }}
            >
              <div className="overflow-hidden rounded-lg" style={{ pointerEvents: 'none' }}>
                {s.enabled ? (
                  <LabSlideCanvas slide={PREVIEW} renderWidth={120} rounded={8} />
                ) : (
                  <div style={{ width: 120, height: 150, background: '#eee', borderRadius: 8 }} />
                )}
              </div>
              <div className="mt-1.5 px-1 text-[12px] font-medium text-neutral-700">{s.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
