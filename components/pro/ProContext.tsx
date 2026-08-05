'use client';

import { createContext, useContext } from 'react';
import type { ProProject } from '@/lib/pro/types';

export type ProState = {
  isOperator: boolean;
  projects: ProProject[];
  activeProjectId: string | null;
  activeProject: ProProject | null;
};

const ProCtx = createContext<ProState>({
  isOperator: false,
  projects: [],
  activeProjectId: null,
  activeProject: null,
});

export function ProProvider({
  value,
  children,
}: {
  value: ProState;
  children: React.ReactNode;
}) {
  return <ProCtx.Provider value={value}>{children}</ProCtx.Provider>;
}

export function usePro(): ProState {
  return useContext(ProCtx);
}
