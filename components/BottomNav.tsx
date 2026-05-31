'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Home, CalendarDays, Plus, BarChart3, User, FileText, LayoutGrid } from 'lucide-react';

/**
 * Floating bottom navigation: 4 destination tabs + a center Create FAB.
 * Mobile-first (the desktop layout uses the sidebar), white surface, with the
 * brand blue accent on the active tab. Replaces the old MobileTabBar.
 *
 * Active state is derived purely from the current route. The active tab colors
 * its icon + label in the accent blue (no tinted pill); inactive tabs are
 * neutral gray.
 */

// Brand functional accent (matches --accent). Used inline so the active color
// is deterministic for assertions and unambiguous in review.
const ACCENT = '#004BA8';

type DestinationTab = {
  label: string;
  href: string;
  matchPrefixes: string[];
  Icon: ComponentType<{ className?: string; color?: string; strokeWidth?: number }>;
};

// Left → right around the center Create FAB:
// Головна · План · ➕ · Аналіз · Профіль
const leftTabs: DestinationTab[] = [
  { label: 'Головна', href: '/dashboard', matchPrefixes: ['/dashboard'], Icon: Home },
  { label: 'План', href: '/plan', matchPrefixes: ['/plan'], Icon: CalendarDays },
];

const rightTabs: DestinationTab[] = [
  {
    label: 'Аналіз',
    href: '/competitor-analysis',
    matchPrefixes: ['/competitor-analysis'],
    Icon: BarChart3,
  },
  { label: 'Профіль', href: '/profile', matchPrefixes: ['/profile'], Icon: User },
];

/** Stories glyph (lucide@1.8 has no dedicated stories icon). */
function StoriesGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="3" width="8" height="18" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="4" y="5" width="3" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.7" opacity="0.5" />
      <rect x="17" y="5" width="3" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.7" opacity="0.5" />
    </svg>
  );
}

// Interim Create menu: until the radial-menu task (86d35yfxw) ships, the FAB
// opens this simple menu so mobile users keep access to their Рілси / Карусель
// / Сторіс lists (each list page also hosts its "create new" entry point).
const createItems: {
  label: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { label: 'Рілси', href: '/projects', Icon: FileText },
  { label: 'Карусель', href: '/carousel', Icon: LayoutGrid },
  { label: 'Сторіс', href: '/storytellings', Icon: StoriesGlyph },
];

function TabLink({ tab, active }: { tab: DestinationTab; active: boolean }) {
  const { label, href, Icon } = tab;
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      data-active={active ? 'true' : 'false'}
      className="flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors"
      style={{ color: active ? ACCENT : '#71717a' /* zinc-500 */ }}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      <span className="max-w-full truncate text-[10px] font-medium leading-tight">{label}</span>
    </a>
  );
}

export default function BottomNav() {
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Close the create menu on navigation.
  useEffect(() => {
    setCreateOpen(false);
  }, [pathname]);

  // Close the create menu on outside tap.
  useEffect(() => {
    if (!createOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setCreateOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [createOpen]);

  // Keep the full-screen carousel editor uncovered (matches prior behaviour).
  const isCarouselEditor = pathname.startsWith('/carousel/') && pathname !== '/carousel';
  if (isCarouselEditor) return null;

  const isActive = (prefixes: string[]) => prefixes.some((p) => pathname.startsWith(p));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Основна навігація"
    >
      <div
        ref={barRef}
        className="relative mx-3 mb-3 flex items-end justify-around gap-1 rounded-2xl border border-gray-100 bg-white px-2 pb-1.5 pt-1.5 shadow-[0_2px_6px_rgba(26,28,46,0.08),0_10px_28px_rgba(26,28,46,0.14)]"
      >
        {leftTabs.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={isActive(tab.matchPrefixes)} />
        ))}

        {/* Center Create FAB — flat solid blue rounded-square, inline-raised. */}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            aria-label="Створити"
            aria-expanded={createOpen}
            aria-haspopup="menu"
            data-testid="create-fab"
            className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-[0_6px_16px_rgba(0,75,168,0.4)] transition-transform active:scale-95"
            style={{ backgroundColor: ACCENT }}
          >
            <Plus className="h-6 w-6" strokeWidth={2.4} />
          </button>
        </div>

        {rightTabs.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={isActive(tab.matchPrefixes)} />
        ))}

        {/* Interim Create menu (replaced by the radial-menu task 86d35yfxw). */}
        {createOpen && (
          <div
            role="menu"
            data-testid="create-menu"
            className="absolute bottom-full left-1/2 mb-3 w-52 -translate-x-1/2 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-xl"
          >
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              Створити
            </p>
            {createItems.map(({ label, href, Icon }) => (
              <a
                key={href}
                href={href}
                role="menuitem"
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-[color:var(--surface)]"
              >
                <Icon className="h-5 w-5 shrink-0 text-zinc-500" />
                {label}
              </a>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
