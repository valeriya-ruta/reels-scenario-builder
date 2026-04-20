'use client';

import { usePathname } from 'next/navigation';
import { FileText, Home, LayoutGrid, Lightbulb } from 'lucide-react';
import { useNavBadges } from '@/components/NavBadgeContext';

const tabs = [
  { label: 'Головна', href: '/dashboard', matchPrefixes: ['/dashboard'], Icon: Home, badgeKey: null },
  { label: 'Сценарій', href: '/projects', matchPrefixes: ['/projects', '/project/'], Icon: FileText, badgeKey: 'reels' },
  { label: 'Карусель', href: '/carousel', matchPrefixes: ['/carousel'], Icon: LayoutGrid, badgeKey: 'carousel' },
  {
    label: 'Ідеї',
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
