'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fallbackProposals } from '@/lib/propose/fallback';
import type { Proposal } from '@/lib/propose/types';

/**
 * Fetch Ruta's proposals for a creation entry point.
 *
 * `proposals` is never empty once `loading` flips false: a failed request falls
 * back to the deterministic cold-start set client-side, because the one thing
 * this screen may not do is show a blank box.
 */
export function useProposals(enabled: boolean) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  // Guards against a slow in-flight response overwriting a newer refresh.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await fetch('/api/propose', { cache: 'no-store' });
      const data = (await res.json()) as { proposals?: Proposal[] };
      if (id !== requestId.current) return;
      setProposals(data.proposals?.length ? data.proposals : fallbackProposals([]));
    } catch {
      if (id !== requestId.current) return;
      setProposals(fallbackProposals([]));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  return { proposals, loading, refresh: load };
}
