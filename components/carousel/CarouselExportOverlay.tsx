'use client';

import { Check, Circle, Download, Loader2 } from 'lucide-react';

/**
 * Full-screen blur overlay that hosts carousel export OFF the editor canvas.
 * - While generating: shows the per-slide progress animation.
 * - When done: a clear primary "Завантажити всі" (bulk) action AND an explicit
 *   per-slide download on each tile, plus a "Повернутись до редагування" exit
 *   that leaves the editor state untouched.
 *
 * The two download modes are deliberate and labelled — no hidden "tap export
 * twice" for bulk.
 */
export default function CarouselExportOverlay({
  open,
  isGenerating,
  hasGenerated,
  generatedImages,
  generatingIndex,
  doneMask,
  errorMessage,
  onDownloadAll,
  onDownloadOne,
  onClose,
}: {
  open: boolean;
  isGenerating: boolean;
  hasGenerated: boolean;
  /** generatedImages[i] = base64 PNG (or null until rendered). */
  generatedImages: (string | null)[];
  generatingIndex: number;
  doneMask: boolean[];
  errorMessage: string | null;
  onDownloadAll: () => void;
  onDownloadOne: (index: number) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const total = generatedImages.length;
  const readyCount = generatedImages.filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Експорт каруселі"
    >
      {/* Blur the whole editor behind the overlay (no route change, no hard modal). */}
      <div className="absolute inset-0 bg-zinc-900/30 backdrop-blur-md" />

      <div className="relative z-[401] flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-[color:var(--border)] bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border)] px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-zinc-900">
            {isGenerating ? 'Експортуємо слайди…' : errorMessage ? 'Не вдалося експортувати' : 'Готово 🎉'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрити"
            className="rounded-lg p-1 text-zinc-500 hover:bg-[color:var(--surface)]"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {errorMessage ? (
            <p className="text-sm leading-relaxed text-red-600" role="alert">
              {errorMessage}
            </p>
          ) : isGenerating || !hasGenerated ? (
            <>
              <p className="mb-3 text-sm text-zinc-600">
                Рендеримо {total} слайд(ів) із збереженої моделі…
              </p>
              <ul className="space-y-2 text-sm">
                {Array.from({ length: total }).map((_, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {doneMask[i] ? (
                      <Check className="h-4 w-4 text-[color:var(--accent)]" />
                    ) : generatingIndex === i ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[color:var(--accent)]" />
                    ) : (
                      <Circle className="h-4 w-4 text-zinc-300" />
                    )}
                    <span className="text-zinc-700">Слайд {i + 1}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-zinc-600">
                Натисни «Завантажити всі», або завантаж окремий слайд з його плитки.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {generatedImages.map((b64, i) =>
                  b64 ? (
                    <div
                      key={i}
                      className="group relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-zinc-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:image/png;base64,${b64}`}
                        alt={`Слайд ${i + 1}`}
                        className="aspect-[4/5] w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => onDownloadOne(i)}
                        aria-label={`Завантажити слайд ${i + 1}`}
                        className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-lg bg-white/90 px-1.5 py-1 text-[11px] font-medium text-zinc-800 shadow-sm backdrop-blur transition hover:bg-white"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {i + 1}
                      </button>
                    </div>
                  ) : null,
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[color:var(--border)] px-5 py-4">
          {!errorMessage && (
            <button
              type="button"
              onClick={onDownloadAll}
              disabled={isGenerating || readyCount === 0}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Завантажити всі{readyCount ? ` (${readyCount})` : ''}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex w-full items-center justify-center rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
          >
            Повернутись до редагування
          </button>
        </div>
      </div>
    </div>
  );
}
