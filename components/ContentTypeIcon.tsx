'use client';

import MaterialIcon from '@/components/ui/MaterialIcon';
import { CONTENT_TYPES, type ContentType } from '@/lib/contentTypes';

/**
 * Single swappable type-icon component. One glyph per content type, rendered in
 * the type's tint color with NO rounded background tile (ClickUp-style inline
 * icon).
 *
 * The glyphs are Material Symbols chosen for what they actually depict — the
 * previous lucide placeholders (a bare Circle for Сторіс, a generic grid for
 * Карусель) didn't read as their content type. Every surface renders through
 * this component, so this map is the only place to change them.
 */
const GLYPHS: Record<ContentType, string> = {
  reels: 'movie',
  carousel: 'view_carousel',
  stories: 'auto_stories',
};

interface ContentTypeIconProps {
  type: ContentType;
  className?: string;
  /** When true, render in `currentColor` instead of the type tint (e.g. on a colored button). */
  inheritColor?: boolean;
  size?: number;
}

export default function ContentTypeIcon({
  type,
  className,
  inheritColor,
  size = 20,
}: ContentTypeIconProps) {
  return (
    <MaterialIcon
      name={GLYPHS[type]}
      size={size}
      className={className}
      style={inheritColor ? undefined : { color: CONTENT_TYPES[type].color }}
    />
  );
}
