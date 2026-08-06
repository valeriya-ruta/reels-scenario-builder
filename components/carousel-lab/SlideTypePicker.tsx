'use client';

import type { LabSlide, LabSlideType, LabSubtype, LabPicturePosition, LabVariant } from '@/lib/carousel-lab/types';
import { CATALOG, PICTURE_POSITION_LABEL, subtypeOption, typeOption } from '@/lib/carousel-lab/catalog';

function Chip({
  active,
  onClick,
  children,
  dim,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition"
      style={{
        background: active ? '#4a6cf7' : '#f1f1f4',
        color: active ? '#fff' : dim ? '#9a9a9a' : '#333',
        border: '1px solid ' + (active ? '#4a6cf7' : 'transparent'),
      }}
    >
      {children}
    </button>
  );
}

export default function SlideTypePicker({
  slide,
  onChange,
}: {
  slide: LabSlide;
  onChange: (patch: Partial<LabSlide>) => void;
}) {
  const sub = subtypeOption(slide.type, slide.subtype);

  function pickType(type: LabSlideType) {
    if (type === slide.type) return;
    const firstSub = typeOption(type)!.subtypes[0];
    onChange({
      type,
      subtype: firstSub.subtype,
      picturePosition: firstSub.picturePositions ? 'none' : 'none',
      variant: (firstSub.variants?.[0]?.id ?? 'default') as LabVariant,
    });
  }
  function pickSubtype(subtype: LabSubtype) {
    const so = subtypeOption(slide.type, subtype);
    onChange({
      subtype,
      picturePosition: so?.picturePositions ? 'none' : 'none',
      variant: (so?.variants?.[0]?.id ?? 'default') as LabVariant,
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Тип слайду</div>
        <div className="flex flex-wrap gap-1.5">
          {CATALOG.map((t) => (
            <Chip key={t.type} active={t.type === slide.type} onClick={() => pickType(t.type)}>
              {t.label}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Підтип</div>
        <div className="flex flex-wrap gap-1.5">
          {typeOption(slide.type)!.subtypes.map((s) => (
            <Chip key={s.subtype} active={s.subtype === slide.subtype} onClick={() => pickSubtype(s.subtype)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {sub?.picturePositions && (
        <div>
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Фото</div>
          <div className="flex flex-wrap gap-1.5">
            {sub.picturePositions.map((p) => (
              <Chip
                key={p}
                active={p === slide.picturePosition}
                dim={p === 'middle'}
                onClick={() => onChange({ picturePosition: p as LabPicturePosition })}
              >
                {PICTURE_POSITION_LABEL[p]}
                {p === 'middle' ? ' •' : ''}
              </Chip>
            ))}
          </div>
          {slide.picturePosition === 'middle' && (
            <div className="mt-1 text-[11px] text-amber-600">Позиція «по центру» без Figma-еталона — не звірена.</div>
          )}
        </div>
      )}

      {sub?.variants && (
        <div>
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Варіант</div>
          <div className="flex flex-wrap gap-1.5">
            {sub.variants.map((v) => (
              <Chip key={v.id} active={v.id === slide.variant} onClick={() => onChange({ variant: v.id })}>
                {v.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
