'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Location } from '@/lib/domain';
import { createLocation, deleteLocation, updateLocation } from '@/app/actions';

function sortLocations(list: Location[]): Location[] {
  return [...list].sort((a, b) =>
    a.name.localeCompare(b.name, 'uk', { sensitivity: 'base' }),
  );
}

interface LocationPickerProps {
  locations: Location[];
  locationId: string | null | undefined;
  disabled?: boolean;
  onSceneLocationChange: (locationId: string | null) => void;
  onLocationsChange: (locations: Location[]) => void;
  /** Clear stale scene.location_id across the project after a location row is removed. */
  onLocationDeleted?: (locationId: string) => void;
}

export default function LocationPicker({
  locations,
  locationId,
  disabled = false,
  onSceneLocationChange,
  onLocationsChange,
  onLocationDeleted,
}: LocationPickerProps) {
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);

  const sorted = sortLocations(locations);
  const query = search.trim();
  const filtered =
    !query
      ? sorted
      : sorted.filter((loc) =>
          loc.name.toLowerCase().includes(query.toLowerCase()),
        );
  const showCreateSuggestion = query.length > 0 && filtered.length === 0;

  const current = locationId
    ? locations.find((l) => l.id === locationId)
    : undefined;
  const summary = current?.name ?? 'Без локації';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [open]);

  const select = (id: string | null) => {
    onSceneLocationChange(id);
    setOpen(false);
    setEditingId(null);
    setSearch('');
  };

  const handleCreateFromQuery = async () => {
    const name = search.trim();
    if (!name || disabled || busy) return;
    setBusy(true);
    try {
      const created = await createLocation(name);
      if (created) {
        onLocationsChange(sortLocations([...locations, created]));
        onSceneLocationChange(created.id);
        setSearch('');
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (loc: Location) => {
    setEditingId(loc.id);
    setEditValue(loc.name);
  };

  const commitEdit = async () => {
    if (!editingId || disabled || busy) return;
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      const updated = await updateLocation(editingId, trimmed);
      if (updated) {
        onLocationsChange(
          sortLocations(locations.map((l) => (l.id === updated.id ? updated : l))),
        );
      }
    } finally {
      setBusy(false);
      setEditingId(null);
    }
  };

  const handleDelete = async (loc: Location) => {
    if (disabled || busy) return;
    if (
      !window.confirm(
        `Видалити локацію «${loc.name}»? Сцени з цією локацією залишаться без локації.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteLocation(loc.id);
      onLocationsChange(locations.filter((l) => l.id !== loc.id));
      if (locationId === loc.id) {
        onSceneLocationChange(null);
      }
      onLocationDeleted?.(loc.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <label className="mb-2 block text-xs font-medium text-zinc-600">
        Локація
      </label>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? panelId : undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={[
          'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
          disabled
            ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400'
            : 'cursor-pointer border-zinc-300 bg-white text-zinc-900 hover:border-zinc-400',
        ].join(' ')}
      >
        <span className="truncate">{summary}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && !disabled && (
        <div
          id={panelId}
          role="listbox"
          className="absolute left-0 right-0 z-[100] mt-1 flex max-h-[min(20rem,70vh)] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
        >
          <div className="shrink-0 border-b border-zinc-100 bg-white px-2 py-2">
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && showCreateSuggestion) {
                  e.preventDefault();
                  void handleCreateFromQuery();
                }
              }}
              placeholder="Пошук локації…"
              aria-label="Пошук локації"
              autoComplete="off"
              className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {!query && (
            <>
              <button
                type="button"
                role="option"
                aria-selected={!locationId}
                onClick={() => select(null)}
                className={[
                  'flex w-full px-3 py-2 text-left text-sm',
                  !locationId ? 'bg-zinc-100 font-medium text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50',
                ].join(' ')}
              >
                Без локації
              </button>
              <div className="my-1 border-t border-zinc-100" />
            </>
          )}
          {showCreateSuggestion && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCreateFromQuery()}
              className="flex w-full cursor-pointer px-3 py-2 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Створити «{query}»
            </button>
          )}
          {filtered.map((loc) => (
            <div
              key={loc.id}
              className="group flex items-stretch gap-0 border-b border-zinc-50 last:border-b-0"
            >
              {editingId === loc.id ? (
                <div className="flex flex-1 items-center gap-1 px-2 py-1.5">
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void commitEdit()}
                    className="shrink-0 rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-0">
                  <button
                    type="button"
                    role="option"
                    aria-selected={locationId === loc.id}
                    onClick={() => select(loc.id)}
                    className={[
                      'min-w-0 flex-1 px-3 py-2 text-left text-sm',
                      locationId === loc.id
                        ? 'bg-zinc-100 font-medium text-zinc-900'
                        : 'text-zinc-700 hover:bg-zinc-50',
                    ].join(' ')}
                  >
                    <span className="truncate">{loc.name}</span>
                  </button>
                  <div className="flex shrink-0 items-center pr-1">
                    <button
                      type="button"
                      aria-label="Перейменувати"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(loc);
                      }}
                      className="cursor-pointer rounded p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg
                        className="h-4 w-4 shrink-0"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label="Видалити"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDelete(loc);
                      }}
                      className="cursor-pointer rounded p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg
                        className="h-4 w-4 shrink-0"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
