'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTapGuard } from '@/lib/ui/tapGuard';

/**
 * A button that only fires on a real tap (§0).
 *
 * `useTapGuard` is a hook, so it cannot be called inside a `.map()`. This wraps
 * it in a component so any list — staging, story options, slide strips — can use
 * the guard per item without restructuring the list itself.
 *
 * Everything else behaves like a normal button: keyboard activation still works,
 * because a click with no preceding pointerdown has no travel to judge.
 */
export default function TapButton({
  onTap,
  children,
  ...rest
}: {
  onTap: () => void;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'onPointerDown' | 'onPointerMove' | 'onPointerCancel'>) {
  const tap = useTapGuard(onTap);
  return (
    <button type="button" {...rest} {...tap}>
      {children}
    </button>
  );
}
