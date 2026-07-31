// `next/link` stub for the proof harness: renders a plain anchor so components
// that navigate can be snapshotted outside a Next runtime. Visual output is
// identical — Link renders an <a> with the same className/children.
import React from 'react';

export default function Link({
  href,
  children,
  ...rest
}: { href: string; children?: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return React.createElement('a', { href, ...rest }, children);
}
