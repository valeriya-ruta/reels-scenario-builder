'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { StoriesOutput } from '@/components/stories/StoriesResult';
import type { CarouselRantOutput } from '@/lib/carouselTypes';

export type RantResultFormat = 'reels' | 'stories' | 'carousel';

export interface RantResultsState {
  /** Pending reel project created from dashboard rant flow */
  reelsProjectId: string | null;
  stories: StoriesOutput | null;
  carousel: CarouselRantOutput | null;
  rantText: string | null;
}

const SS_REELS = 'ruta-rant-pending:reels-project-id';
const SS_STORIES = 'ruta-rant-pending:stories-json';
const SS_CAROUSEL = 'ruta-rant-pending:carousel-json';

function writeSsReels(projectId: string) {
  try {
    sessionStorage.setItem(SS_REELS, projectId);
  } catch {
    /* ignore quota / private mode */
  }
}

function writeSsStories(data: StoriesOutput) {
  try {
    sessionStorage.setItem(SS_STORIES, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function writeSsCarousel(data: CarouselRantOutput) {
  try {
    sessionStorage.setItem(SS_CAROUSEL, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function clearSs(format: RantResultFormat) {
  try {
    if (format === 'reels') sessionStorage.removeItem(SS_REELS);
    if (format === 'stories') sessionStorage.removeItem(SS_STORIES);
    if (format === 'carousel') sessionStorage.removeItem(SS_CAROUSEL);
  } catch {
    /* ignore */
  }
}

/** Fallback when visiting a page after navigation (or React Strict Mode remounts). */
export function readPendingReelProjectIdFromStorage(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(SS_REELS);
  } catch {
    return null;
  }
}

export function readPendingStoriesFromStorage(): StoriesOutput | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SS_STORIES);
    if (!raw) return null;
    return JSON.parse(raw) as StoriesOutput;
  } catch {
    return null;
  }
}

export function readPendingCarouselFromStorage(): CarouselRantOutput | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SS_CAROUSEL);
    if (!raw) return null;
    return JSON.parse(raw) as CarouselRantOutput;
  } catch {
    return null;
  }
}

type RantResultsContextValue = {
  state: RantResultsState;
  setReelResult: (projectId: string, rantText: string) => void;
  setStoriesResult: (data: StoriesOutput, rantText: string) => void;
  setCarouselResult: (data: CarouselRantOutput, rantText: string) => void;
  clearResult: (format: RantResultFormat) => void;
};

const defaultState: RantResultsState = {
  reelsProjectId: null,
  stories: null,
  carousel: null,
  rantText: null,
};

const RantResultsContext = createContext<RantResultsContextValue | null>(null);

export function RantResultsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RantResultsState>(defaultState);

  const setReelResult = useCallback((projectId: string, rantText: string) => {
    writeSsReels(projectId);
    setState((prev) => ({
      ...prev,
      reelsProjectId: projectId,
      rantText,
    }));
  }, []);

  const setStoriesResult = useCallback((data: StoriesOutput, rantText: string) => {
    writeSsStories(data);
    setState((prev) => ({
      ...prev,
      stories: data,
      rantText,
    }));
  }, []);

  const setCarouselResult = useCallback((data: CarouselRantOutput, rantText: string) => {
    writeSsCarousel(data);
    setState((prev) => ({
      ...prev,
      carousel: data,
      rantText,
    }));
  }, []);

  const clearResult = useCallback((format: RantResultFormat) => {
    clearSs(format);
    setState((prev) => {
      if (format === 'reels') {
        return { ...prev, reelsProjectId: null };
      }
      if (format === 'stories') {
        return { ...prev, stories: null };
      }
      return { ...prev, carousel: null };
    });
  }, []);

  const value = useMemo(
    () => ({ state, setReelResult, setStoriesResult, setCarouselResult, clearResult }),
    [state, setReelResult, setStoriesResult, setCarouselResult, clearResult]
  );

  return <RantResultsContext.Provider value={value}>{children}</RantResultsContext.Provider>;
}

export function useRantResults() {
  const ctx = useContext(RantResultsContext);
  if (!ctx) {
    throw new Error('useRantResults must be used within RantResultsProvider');
  }
  return ctx;
}
