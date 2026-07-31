'use client';

import Link from 'next/link';
import { tierProgress } from '@/lib/insights/postedLink';

/**
 * The coin (Prompt 3) — submission count at a glance, top-right of Home.
 *
 * Sits opposite the greeting because that pairing is the whole daily frame:
 * who you are on the left, how you're doing on the right. Tapping opens the
 * tiers page.
 *
 * The ring is progress toward the NEXT tier only, not toward the final one — a
 * bar that barely moves for weeks is demotivating, and the next reward is the
 * only one that changes behaviour today.
 */
export default function CoinBadge({ count }: { count: number }) {
  const progress = tierProgress(count);
  const size = 46;
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Link
      href="/rewards"
      data-testid="coin-badge"
      aria-label={`${count} опублікованих посилань`}
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress.fraction)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <span className="text-[15px] font-bold tabular-nums text-[color:var(--foreground)]">
        {count}
      </span>
    </Link>
  );
}
