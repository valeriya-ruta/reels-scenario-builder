'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Home, CalendarDays, Plus, X, BarChart3, User } from 'lucide-react';
import CreateRadialMenu, {
  RADIAL_OPTIONS,
  type RadialOptionId,
} from './CreateRadialMenu';
import BraindumpOverlay from './BraindumpOverlay';
import { CONTENT_TYPES } from '@/lib/contentTypes';

/**
 * Floating bottom navigation: 4 destination tabs + a center Create FAB.
 * Mobile-first (the desktop layout uses the sidebar), white surface, with the
 * brand blue accent on the active tab.
 *
 * The Create FAB opens the radial menu (task 86d35yfxw): 4 options fan up in an
 * arc. Tap-to-open → tap-option is the guaranteed path; long-press + glide-release
 * is layered on top. Рілс/Карусель/Сторіс route into their creation flows; Ідеї
 * opens the braindump blur-overlay (task 86d38zghd) — NOT a route.
 */

const ACCENT = '#004BA8';

type DestinationTab = {
  label: string;
  href: string;
  matchPrefixes: string[];
  Icon: ComponentType<{ className?: string; color?: string; strokeWidth?: number }>;
};

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

/** Routes for the three content-creation options (Ідеї is handled separately). */
const OPTION_ROUTES: Record<Exclude<RadialOptionId, 'ideas'>, string> = {
  reels: CONTENT_TYPES.reels.createHref,
  carousel: CONTENT_TYPES.carousel.createHref,
  stories: CONTENT_TYPES.stories.createHref,
};

/** Distance (px) the pointer must travel before a long-press becomes a glide. */
const GLIDE_THRESHOLD = 8;

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
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [highlightedId, setHighlightedId] = useState<RadialOptionId | null>(null);
  const [braindumpOpen, setBraindumpOpen] = useState(false);

  const fabRef = useRef<HTMLButtonElement>(null);
  const bubbleEls = useRef<Map<RadialOptionId, HTMLButtonElement>>(new Map());
  // Glide gesture bookkeeping. `openedByHold` = a long-press opened the menu in
  // this gesture; `gliding` = the pointer moved past the threshold;
  // `suppressClick` = swallow the trailing click so it doesn't re-toggle.
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    openedByHold: boolean;
    gliding: boolean;
    suppressClick: boolean;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ startX: 0, startY: 0, openedByHold: false, gliding: false, suppressClick: false, timer: null });

  const computeAnchor = useCallback(() => {
    const rect = fabRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const openMenu = useCallback(() => {
    setAnchor(computeAnchor());
    setMenuOpen(true);
  }, [computeAnchor]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setHighlightedId(null);
  }, []);

  // Close the menu on navigation.
  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  const selectOption = useCallback(
    (id: RadialOptionId) => {
      closeMenu();
      if (id === 'ideas') {
        setBraindumpOpen(true);
        return;
      }
      router.push(OPTION_ROUTES[id]);
    },
    [closeMenu, router]
  );

  // --- Tap path (guaranteed): click toggles the menu open/closed. ---
  const onFabClick = useCallback(() => {
    if (gestureRef.current.suppressClick) {
      gestureRef.current.suppressClick = false;
      return;
    }
    if (menuOpen) closeMenu();
    else openMenu();
  }, [menuOpen, openMenu, closeMenu]);

  // --- Glide enhancement: long-press + drag to a bubble, release to select. ---
  const registerBubble = useCallback((id: RadialOptionId, el: HTMLButtonElement | null) => {
    if (el) bubbleEls.current.set(id, el);
    else bubbleEls.current.delete(id);
  }, []);

  const bubbleUnderPoint = useCallback((x: number, y: number): RadialOptionId | null => {
    for (const opt of RADIAL_OPTIONS) {
      const el = bubbleEls.current.get(opt.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return opt.id;
    }
    return null;
  }, []);

  const clearGlideTimer = useCallback(() => {
    if (gestureRef.current.timer) {
      clearTimeout(gestureRef.current.timer);
      gestureRef.current.timer = null;
    }
  }, []);

  const onFabPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const g = gestureRef.current;
      g.startX = e.clientX;
      g.startY = e.clientY;
      g.gliding = false;
      g.openedByHold = false;
      clearGlideTimer();
      // Long-press opens the menu so the user can glide to a bubble while holding.
      // A quick tap never reaches this timer, so the tap path stays intact.
      g.timer = setTimeout(() => {
        if (!menuOpen) {
          openMenu();
          g.openedByHold = true;
        }
      }, 180);
    },
    [menuOpen, openMenu, clearGlideTimer]
  );

  const onFabPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const g = gestureRef.current;
      const moved = Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > GLIDE_THRESHOLD;
      // Movement promotes the gesture to a glide and opens the menu early.
      if (moved && !menuOpen && !g.openedByHold) {
        clearGlideTimer();
        openMenu();
        g.openedByHold = true;
      }
      if (moved) g.gliding = true;
      if (g.gliding) setHighlightedId(bubbleUnderPoint(e.clientX, e.clientY));
    },
    [menuOpen, openMenu, clearGlideTimer, bubbleUnderPoint]
  );

  const onFabPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const g = gestureRef.current;
      clearGlideTimer();
      if (!g.openedByHold) return; // plain tap → let onClick toggle the menu

      // The hold opened the menu, so swallow the trailing click either way.
      g.suppressClick = true;
      const target = g.gliding ? bubbleUnderPoint(e.clientX, e.clientY) : null;
      setHighlightedId(null);

      if (g.gliding) {
        if (target) selectOption(target);
        else closeMenu(); // glided onto empty space → cancel
      }
      // Held without gliding → leave the menu open for the tap path.
      g.gliding = false;
      g.openedByHold = false;
    },
    [clearGlideTimer, bubbleUnderPoint, selectOption, closeMenu]
  );

  // Clear any pending long-press timer on unmount.
  useEffect(() => () => clearGlideTimer(), [clearGlideTimer]);

  // Keep the full-screen carousel editor uncovered (matches prior behaviour).
  const isCarouselEditor = pathname.startsWith('/carousel/') && pathname !== '/carousel';
  if (isCarouselEditor) return null;

  const isActive = (prefixes: string[]) => prefixes.some((p) => pathname.startsWith(p));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Основна навігація"
      >
        <div className="relative mx-3 mb-3 flex items-end justify-around gap-1 rounded-2xl border border-gray-100 bg-white px-2 pb-1.5 pt-1.5 shadow-[0_2px_6px_rgba(26,28,46,0.08),0_10px_28px_rgba(26,28,46,0.14)]">
          {leftTabs.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(tab.matchPrefixes)} />
          ))}

          {/* Center Create FAB — toggles to × while the radial menu is open. */}
          <div className="flex flex-1 justify-center">
            <button
              ref={fabRef}
              type="button"
              onClick={onFabClick}
              onPointerDown={onFabPointerDown}
              onPointerMove={onFabPointerMove}
              onPointerUp={onFabPointerUp}
              onPointerCancel={() => {
                clearGlideTimer();
                gestureRef.current.openedByHold = false;
                gestureRef.current.gliding = false;
                setHighlightedId(null);
              }}
              aria-label={menuOpen ? 'Закрити' : 'Створити'}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              data-testid="create-fab"
              className="-mt-5 flex h-12 w-12 touch-none items-center justify-center rounded-2xl text-white shadow-[0_6px_16px_rgba(0,75,168,0.4)] transition-transform active:scale-95"
              style={{ backgroundColor: ACCENT }}
            >
              {menuOpen ? (
                <X className="h-6 w-6" strokeWidth={2.6} />
              ) : (
                <Plus className="h-6 w-6" strokeWidth={2.4} />
              )}
            </button>
          </div>

          {rightTabs.map((tab) => (
            <TabLink key={tab.href} tab={tab} active={isActive(tab.matchPrefixes)} />
          ))}
        </div>
      </nav>

      <CreateRadialMenu
        open={menuOpen}
        anchor={anchor}
        highlightedId={highlightedId}
        onSelect={selectOption}
        onDismiss={closeMenu}
        registerBubble={registerBubble}
      />

      <BraindumpOverlay open={braindumpOpen} onClose={() => setBraindumpOpen(false)} />
    </>
  );
}
