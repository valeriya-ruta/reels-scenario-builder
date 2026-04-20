'use client';

import { usePathname } from 'next/navigation';
import { FileText, Home, LayoutGrid, Lightbulb } from 'lucide-react';

const tabs = [
  { label: 'Головна', href: '/dashboard', matchPrefixes: ['/dashboard'], Icon: Home },
  { label: 'Сценарій', href: '/projects', matchPrefixes: ['/projects', '/project/'], Icon: FileText },
  { label: 'Карусель', href: '/carousel', matchPrefixes: ['/carousel'], Icon: LayoutGrid },
  {
    label: 'Ідеї',
    href: '/competitor-analysis',
    matchPrefixes: ['/competitor-analysis'],
    Icon: Lightbulb,
  },
] as const;

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-100 bg-white px-2 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Основна навігація"
    >
      {tabs.map(({ label, href, matchPrefixes, Icon }) => {
        const active = matchPrefixes.some((p) => pathname.startsWith(p));
        return (
          <a
            key={href}
            href={href}
            className={[
              'flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors',
              active ? 'text-[color:var(--accent)]' : 'text-zinc-500',
            ].join(' ')}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className="max-w-full truncate text-[10px] font-medium leading-tight">{label}</span>
          </a>
        );
      })}
    </nav>
  );
}
