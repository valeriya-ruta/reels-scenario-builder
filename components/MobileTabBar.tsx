'use client';

import { usePathname } from 'next/navigation';
import { FileText, LayoutGrid, Lightbulb } from 'lucide-react';
import { useNavBadges } from '@/components/NavBadgeContext';

function HomeBulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 21h6M10 18h4M12 3a6 6 0 0 1 4 10.5V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-3.5A6 6 0 0 1 12 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StoriesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="3" width="8" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="5" width="3" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect x="17" y="5" width="3" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

const tabs = [
  { label: 'Головна', href: '/dashboard', matchPrefixes: ['/dashboard'], Icon: HomeBulbIcon, badgeKey: null },
  { label: 'Рілси', href: '/projects', matchPrefixes: ['/projects', '/project/'], Icon: FileText, badgeKey: 'reels' },
  { label: 'Карусель', href: '/carousel', matchPrefixes: ['/carousel'], Icon: LayoutGrid, badgeKey: 'carousel' },
  {
    label: 'Сторіс',
    href: '/storytellings',
    matchPrefixes: ['/storytellings', '/storytelling/', '/stories'],
    Icon: StoriesIcon,
    badgeKey: 'storytelling',
  },
  {
    label: 'Аналіз',
    href: '/competitor-analysis',
    matchPrefixes: ['/competitor-analysis'],
    Icon: Lightbulb,
    badgeKey: null,
  },
] as const;

export default function MobileTabBar() {
  const pathname = usePathname();
  const { badges } = useNavBadges();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-100 bg-white px-2 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Основна навігація"
    >
      {tabs.map(({ label, href, matchPrefixes, Icon, badgeKey }) => {
        const active = matchPrefixes.some((p) => pathname.startsWith(p));
        const hasNewBadge = badgeKey ? badges[badgeKey] : false;
        return (
          <a
            key={href}
            href={href}
            className={[
              'relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors',
              active ? 'text-[color:var(--accent)]' : 'text-zinc-500',
            ].join(' ')}
          >
            {hasNewBadge && (
              <span className="absolute right-1 top-0 rounded-full bg-[color:var(--accent)] px-1.5 py-[2px] text-[9px] font-semibold uppercase leading-none text-white">
                NEW
              </span>
            )}
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className="max-w-full truncate text-[10px] font-medium leading-tight">{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
