'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Back control that returns you where you actually came from.
 *
 * Editors were hardcoded to their list ("Всі каруселі" → /carousel), so opening
 * a carousel from Home and pressing back dumped you in the carousel list instead
 * of Home. This walks browser history when there is same-app history to walk,
 * and only falls back to the list route on a cold entry (direct link / refresh).
 */
export default function BackLink({
  fallbackHref,
  ariaLabel,
  className,
  children,
}: {
  fallbackHref: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const goBack = () => {
    const hasAppHistory =
      typeof window !== 'undefined' &&
      window.history.length > 1 &&
      // Same-origin referrer (or none, e.g. client-side nav) means the previous
      // entry is a page of this app, so history-back lands somewhere sensible.
      (document.referrer === '' || document.referrer.startsWith(window.location.origin));

    if (hasAppHistory) router.back();
    else router.push(fallbackHref);
  };

  return (
    <button type="button" onClick={goBack} aria-label={ariaLabel} className={className}>
      {children}
    </button>
  );
}
