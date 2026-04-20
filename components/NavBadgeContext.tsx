'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

export type NavBadgeKey = 'reels' | 'stories' | 'storytelling' | 'carousel';

const STORAGE_PREFIX = 'ruta-nav-dot:';

function readStored(): Record<NavBadgeKey, boolean> {
  if (typeof window === 'undefined') {
    return { reels: false, stories: false, storytelling: false, carousel: false };
  }
  return {
    reels: sessionStorage.getItem(`${STORAGE_PREFIX}reels`) === '1',
    stories: sessionStorage.getItem(`${STORAGE_PREFIX}stories`) === '1',
    storytelling: sessionStorage.getItem(`${STORAGE_PREFIX}storytelling`) === '1',
    carousel: sessionStorage.getItem(`${STORAGE_PREFIX}carousel`) === '1',
  };
}

function writeStored(key: NavBadgeKey, on: boolean) {
  if (typeof window === 'undefined') return;
  const k = `${STORAGE_PREFIX}${key}`;
  if (on) sessionStorage.setItem(k, '1');
  else sessionStorage.removeItem(k);
}

type NavBadgeContextValue = {
  badges: Record<NavBadgeKey, boolean>;
  setBadge: (key: NavBadgeKey, on: boolean) => void;
  clearBadge: (key: NavBadgeKey) => void;
};

const NavBadgeContext = createContext<NavBadgeContextValue | null>(null);

export function NavBadgeProvider({ children }: { children: React.ReactNode }) {
  const [badges, setBadges] = useState<Record<NavBadgeKey, boolean>>({
    reels: false,
    stories: false,
    storytelling: false,
    carousel: false,
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate nav dots from sessionStorage after SSR
    setBadges(readStored());
  }, []);

  const setBadge = useCallback((key: NavBadgeKey, on: boolean) => {
    setBadges((prev) => ({ ...prev, [key]: on }));
    writeStored(key, on);
  }, []);

  const clearBadge = useCallback((key: NavBadgeKey) => {
    setBadges((prev) => ({ ...prev, [key]: false }));
    writeStored(key, false);
  }, []);

  const value = useMemo(
    () => ({ badges, setBadge, clearBadge }),
    [badges, setBadge, clearBadge]
  );

  return <NavBadgeContext.Provider value={value}>{children}</NavBadgeContext.Provider>;
}

export function useNavBadges() {
  const ctx = useContext(NavBadgeContext);
  if (!ctx) {
    throw new Error('useNavBadges must be used within NavBadgeProvider');
  }
  return ctx;
}

/** Clears nav dots when the user visits the corresponding section. */
export function NavBadgePathSync() {
  const pathname = usePathname();
  const { clearBadge } = useNavBadges();

  useEffect(() => {
    if (pathname.startsWith('/projects') || pathname.startsWith('/project/')) {
      clearBadge('reels');
    }
    if (
      pathname.startsWith('/storytelling/') ||
      pathname.startsWith('/storytellings') ||
      pathname.startsWith('/stories')
    ) {
      clearBadge('storytelling');
      clearBadge('stories');
    }
    if (pathname.startsWith('/carousel')) {
      clearBadge('carousel');
    }
  }, [pathname, clearBadge]);

  return null;
}
