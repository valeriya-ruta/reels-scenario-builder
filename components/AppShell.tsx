'use client';

import { useState, useRef, useCallback } from 'react';
import Sidebar from './Sidebar';

interface AppShellProps {
  children: React.ReactNode;
  userName?: string | null;
  userEmail?: string | null;
}

const DEFAULT_WIDTH = 224;
const MIN_WIDTH = 160;
const MAX_WIDTH = 420;

export default function AppShell({ children, userName, userEmail }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const isResizing = useRef(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX)));
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="Toggle menu"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2 4h14M2 9h14M2 14h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <a href="/projects" className="group flex flex-col leading-none">
          <span className="text-[1.65rem] font-bold tracking-wide text-zinc-800 group-hover:text-zinc-900">
            Ruta
          </span>
          <span className="mt-0.5 text-[0.8rem] font-light tracking-wide text-zinc-500 group-hover:text-zinc-700">
            Твоя контент-подружка
          </span>
        </a>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Always rendered so the slide transition plays; width collapses to 0 when closed */}
        <div
          className="relative flex shrink-0 overflow-hidden"
          style={{
            width: sidebarOpen ? sidebarWidth : 0,
            transition: isResizing.current ? 'none' : 'width 0.25s ease',
          }}
        >
          <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex h-full">
            <Sidebar userName={userName} userEmail={userEmail} />
          </div>
          {/* Drag-to-resize handle */}
          {sidebarOpen && (
            <div
              onMouseDown={startResize}
              className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition-colors hover:bg-zinc-300"
            />
          )}
        </div>

        <main className="flex-1 overflow-y-auto px-8 py-8">{children}</main>
      </div>
    </div>
  );
}
