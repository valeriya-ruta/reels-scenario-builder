'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Land on Головна when the installed app is LAUNCHED.
 *
 * The manifest's `start_url` is not enough. iOS Safari's "Add to Home Screen"
 * bakes in whichever page was open at the moment you added it and ignores
 * `start_url` entirely — so an icon created while looking at Каруселі keeps
 * opening Каруселі forever, no matter what the manifest says. Re-adding from
 * the right page works, but depending on the user to install from exactly one
 * screen is a bad design.
 *
 * So: on a COLD LAUNCH of the installed app, go to /dashboard. A sessionStorage
 * marker makes it fire once per app session, which is what keeps ordinary
 * in-app navigation to Каруселі working normally — the redirect is about how
 * the app OPENS, not about where you may go.
 *
 * Browser tabs are untouched: this only runs in standalone display mode.
 */

const LAUNCHED_KEY = 'ruta:launched';

/** Never bounce off these — auth flow owns its own routing. */
const AUTH_PATHS = new Set(['/', '/login', '/signup', '/auth/reset-password']);

export default function StandaloneLaunchRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Installed-app check. `navigator.standalone` is the iOS-only signal; the
    // media query covers Android/desktop PWAs.
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isStandalone) return;

    let alreadyLaunched = false;
    try {
      alreadyLaunched = window.sessionStorage.getItem(LAUNCHED_KEY) === '1';
      window.sessionStorage.setItem(LAUNCHED_KEY, '1');
    } catch {
      // Private mode / storage disabled: skip rather than redirect on every
      // navigation, which would trap the user on Головна.
      return;
    }
    if (alreadyLaunched) return;

    if (pathname === '/dashboard' || AUTH_PATHS.has(pathname)) return;
    router.replace('/dashboard');
    // Launch-only: deliberately not re-running when the route changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
