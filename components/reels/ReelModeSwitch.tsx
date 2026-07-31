'use client';

import { ListOrdered, Captions } from 'lucide-react';

export type ReelMode = 'scenario' | 'teleprompter';

/**
 * The reel editor's two modes, stated at the top of the screen rather than
 * hidden behind a settings toggle.
 *
 * Сценарій is a shot list you WORK from — numbered scenes, framing, notes.
 * Суфлер is a text you READ from — one continuous block, nothing else on
 * screen. They are two different jobs, so they get two different surfaces and
 * one obvious switch between them.
 */
export default function ReelModeSwitch({
  mode,
  onChange,
}: {
  mode: ReelMode;
  onChange: (mode: ReelMode) => void;
}) {
  const options: { id: ReelMode; label: string; hint: string; Icon: typeof ListOrdered }[] = [
    { id: 'scenario', label: 'Сценарій', hint: 'по сценах', Icon: ListOrdered },
    { id: 'teleprompter', label: 'Суфлер', hint: 'суцільний текст', Icon: Captions },
  ];

  return (
    <div
      role="tablist"
      aria-label="Режим"
      data-testid="reel-mode-switch"
      className="flex gap-1 rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface1)] p-1"
    >
      {options.map((opt) => {
        const active = mode === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-mode={opt.id}
            data-active={active ? 'true' : 'false'}
            onClick={() => onChange(opt.id)}
            className="flex flex-1 items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 transition-colors"
            style={{
              backgroundColor: active ? 'var(--background)' : 'transparent',
              boxShadow: active ? 'var(--elev-1)' : undefined,
              color: active ? 'var(--foreground)' : 'var(--text-muted)',
            }}
          >
            <opt.Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2.2 : 1.9} />
            <span className="min-w-0 truncate text-[13.5px] font-semibold tracking-tight">
              {opt.label}
            </span>
            <span className="hidden text-[11.5px] text-[color:var(--text-muted)] sm:inline">
              · {opt.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
