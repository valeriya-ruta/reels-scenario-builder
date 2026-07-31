// `next/navigation` stub for the proof harness. Components that navigate can be
// rendered statically; nothing in a screenshot ever fires a route change.
export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  };
}

export function usePathname(): string {
  return '/';
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function redirect(): never {
  throw new Error('redirect() called in the proof harness');
}
