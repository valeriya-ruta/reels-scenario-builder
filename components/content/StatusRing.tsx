'use client';

import { useEffect, useRef, useState } from 'react';
import {
  isPublished as isPublishedStatus,
  statusColor,
  statusFraction,
  type ContentStatus,
  type ContentType,
} from '@/lib/content/statusSystem';

/**
 * Pie-fill status ring (Status system 2/8 — task 86d3btmaq).
 *
 * A faint full circle is always visible; a SOLID wedge of the status colour
 * fills CLOCKWISE from 12 o'clock by `fraction` (how far the piece is along its
 * type's track). At Опубліковано the whole circle is a solid disc with a white
 * check. An idea-type piece shows a small sliver.
 *
 * Pure presentational: pass `{ type, status }` (it derives colour/fraction from
 * the status system) OR the raw `{ fraction, color, isPublished }`.
 */
type ByStatus = { type: ContentType; status: ContentStatus };
type Raw = { fraction: number; color: string; isPublished?: boolean };

export type StatusRingProps = (ByStatus | Raw) & {
  size?: number;
  /** Disable the grow animation (e.g. for static rendering/tests). */
  animate?: boolean;
  className?: string;
};

function isByStatus(p: StatusRingProps): p is ByStatus & { size?: number } {
  return (p as ByStatus).status !== undefined && (p as ByStatus).type !== undefined;
}

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** Filled pie sector from 12 o'clock, clockwise, covering `fraction` of the circle. */
function wedgePath(cx: number, cy: number, r: number, fraction: number): string {
  const f = Math.max(0, Math.min(1, fraction));
  if (f <= 0) return '';
  if (f >= 1) {
    // Full disc as two arcs (a single 360° arc is degenerate in SVG).
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  }
  const [sx, sy] = polar(cx, cy, r, -90); // 12 o'clock
  const [ex, ey] = polar(cx, cy, r, -90 + f * 360);
  const largeArc = f > 0.5 ? 1 : 0;
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey} Z`;
}

export default function StatusRing(props: StatusRingProps) {
  const size = props.size ?? 30;
  const animate = props.animate ?? true;

  const target = isByStatus(props)
    ? statusFraction(props.type, props.status)
    : props.fraction;
  const color = isByStatus(props) ? statusColor(props.status) : props.color;
  const published = isByStatus(props)
    ? isPublishedStatus(props.status)
    : Boolean(props.isPublished);

  // Animate the wedge growing on change. Initialise to the target so the first
  // (incl. server) render is already correct.
  const [shown, setShown] = useState(published ? 1 : target);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const goal = published ? 1 : target;
    if (!animate) {
      setShown(goal);
      return;
    }
    let start: number | null = null;
    const from = shown;
    const dur = 320;
    const tick = (t: number) => {
      if (start === null) start = t;
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3); // easeOutCubic
      setShown(from + (goal - from) * eased);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, published, animate]);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1; // 1px inset so the outline stroke isn't clipped

  const checkSize = size * 0.5;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={props.className}
      role="img"
      aria-hidden="true"
    >
      {/* Faint track behind the wedge — only once there is progress. At the idea
          stage (no wedge) the ring is outline-only, empty inside (task 86d3c7mcn). */}
      {published || shown > 0.0001 ? (
        <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.16} />
      ) : null}
      {/* Solid clockwise wedge (or full disc when published). */}
      {published ? (
        <circle cx={cx} cy={cy} r={r} fill={color} />
      ) : (
        <path d={wedgePath(cx, cy, r, shown)} fill={color} />
      )}
      {/* Thin outline so the circle edge reads on light + dark surfaces. */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1} opacity={0.45} />
      {/* White check at published. */}
      {published ? (
        <path
          d={`M ${cx - checkSize * 0.32} ${cy + checkSize * 0.02}
              L ${cx - checkSize * 0.08} ${cy + checkSize * 0.26}
              L ${cx + checkSize * 0.36} ${cy - checkSize * 0.26}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={Math.max(1.6, size * 0.08)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}
