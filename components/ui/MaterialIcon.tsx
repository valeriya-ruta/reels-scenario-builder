'use client';

/**
 * Material Symbols icon (app UI system).
 *
 * The content-type icons were generic lucide glyphs (a circle for Сторіс, a grid
 * for Карусель) that didn't read as what they represent. These are the real
 * Material Symbols — `view_carousel`, `movie`, `auto_stories`, `lightbulb_2` —
 * which are purpose-built for exactly these concepts.
 *
 * The font is loaded in app/layout.tsx, subset to only the icons we use, with
 * the FILL axis available so a filled variant can be used for emphasis.
 */
export default function MaterialIcon({
  name,
  size = 20,
  filled = false,
  weight = 400,
  className,
  style,
}: {
  name: string;
  size?: number;
  filled?: boolean;
  weight?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={`material-symbols${className ? ` ${className}` : ''}`}
      style={{
        fontSize: size,
        lineHeight: 1,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
