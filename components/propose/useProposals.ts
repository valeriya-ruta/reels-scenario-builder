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
  // Every title shown this session. «Ще раз» must return genuinely NEW angles —
  // Round 1 sometimes repeated, because identical signals plus a fixed prompt
  // give the model every reason to land on the same phrasing twice. Sending the
  // seen set lets the server exclude them, and dropping any repeat that slips
  // through means a repeat can never reach the screen.
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async (fresh = false) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fresh && seen.current.size > 0) {
        params.set('exclude', [...seen.current].slice(-12).join('|'));
      }
      const query = params.toString();
      const res = await fetch(`/api/propose${query ? `?${query}` : ''}`, { cache: 'no-store' });
      const data = (await res.json()) as { proposals?: Proposal[] };
      if (id !== requestId.current) return;

      const incoming = data.proposals?.length ? data.proposals : fallbackProposals([]);
      const unseen = fresh ? incoming.filter((p) => !seen.current.has(norm(p.title))) : incoming;
      // If the model returned nothing new at all, show what came back rather
      // than an empty deck — a stale angle still beats a blank box.
      const next = unseen.length > 0 ? unseen : incoming;
      for (const p of next) seen.current.add(norm(p.title));
      setProposals(next);
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

  /** «Ще раз» — always asks for angles the user has not already been shown. */
  const refresh = useCallback(() => load(true), [load]);

  return { proposals, loading, refresh };
}

/** Compare titles case- and whitespace-insensitively so near-repeats are caught. */
function norm(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}
