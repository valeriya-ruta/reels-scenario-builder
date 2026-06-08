import type { ComponentType, CSSProperties } from 'react';
import { Video, LayoutGrid, Circle } from 'lucide-react';
import { CONTENT_TYPES, type ContentType } from '@/lib/contentTypes';

/**
 * Single swappable type-icon component. One glyph per content type, rendered in
 * the type's tint color with NO rounded background tile (ClickUp-style inline
 * icon). The glyphs here are placeholders — Kunj will swap the final icons later.
 * Because every surface renders the icon through this one component, swapping the
 * glyph map below is the only change needed when the final icons land.
 */

const GLYPHS: Record<
  ContentType,
  ComponentType<{ className?: string; strokeWidth?: number; style?: CSSProperties }>
> = {
  reels: Video,
  carousel: LayoutGrid,
  stories: Circle,
};

interface ContentTypeIconProps {
  type: ContentType;
  className?: string;
  /** When true, render in `currentColor` instead of the type tint (e.g. on a colored button). */
  inheritColor?: boolean;
}

export default function ContentTypeIcon({ type, className = 'h-5 w-5', inheritColor }: ContentTypeIconProps) {
  const Glyph = GLYPHS[type];
  return (
    <Glyph
      className={className}
      strokeWidth={1.9}
      {...(inheritColor ? {} : { style: { color: CONTENT_TYPES[type].color } })}
    />
  );
}
