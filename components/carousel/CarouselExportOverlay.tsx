'use client';

import { Check, Circle, Download, Loader2, Share2 } from 'lucide-react';
import BlurScrim from '@/components/BlurScrim';

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
  onShareAll,
  onSaveOne,
  onShareOne,
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
  /** Primary: save real files to the device. */
  onDownloadAll: () => void;
  /** Secondary: open the OS share sheet (Telegram / Save image …). */
  onShareAll: () => void;
  /** Per-slide: save this one slide to the gallery as a real file. */
  onSaveOne: (index: number) => void;
  /** Per-slide: share this one slide via the OS share sheet. */
  onShareOne: (index: number) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  const total = generatedImages.length;
  const readyCount = generatedImages.filter(Boolean).length;

  return (
    <BlurScrim
      zIndex={400}
      blurPx={14}
      tint="rgba(24,24,27,0.32)"
      className="flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Експорт каруселі"
    >
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
                <b>«Завантажити всі»</b> збереже кожен слайд окремим файлом на
                пристрій. <b>«Поділитися»</b> відкриє меню (Telegram, «Зберегти
                зображення» тощо). На кожній плитці є дві кнопки: зберегти цей
                слайд у галерею (⤓) або поділитися ним.
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
                      <div className="absolute bottom-1 right-1 flex items-center gap-1">
                        {/* Save this slide to the gallery as a real file. */}
                        <button
                          type="button"
                          onClick={() => onSaveOne(i)}
                          aria-label={`Зберегти слайд ${i + 1}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/90 px-1.5 py-1 text-[11px] font-medium text-zinc-800 shadow-sm backdrop-blur transition hover:bg-white"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {i + 1}
                        </button>
                        {/* Share this slide via the OS share sheet. */}
                        <button
                          type="button"
                          onClick={() => onShareOne(i)}
                          aria-label={`Поділитися слайдом ${i + 1}`}
                          className="inline-flex items-center justify-center rounded-lg bg-white/90 p-1 text-zinc-800 shadow-sm backdrop-blur transition hover:bg-white"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : null,
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[color:var(--border)] px-5 py-4">
          {!errorMessage && (
            <div className="flex gap-2">
              {/* Primary (dominant): save real files to the device. */}
              <button
                type="button"
                onClick={onDownloadAll}
                disabled={isGenerating || readyCount === 0}
                className="inline-flex flex-[7] items-center justify-center gap-2 rounded-xl bg-[#004BA8] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span className="whitespace-nowrap">Завантажити всі</span>
              </button>
              {/* Secondary: OS share sheet (keeps the wanted share-to-Telegram flow). */}
              <button
                type="button"
                onClick={onShareAll}
                disabled={isGenerating || readyCount === 0}
                aria-label="Поділитися"
                className="inline-flex flex-[3] items-center justify-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-white px-3 py-3 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)] disabled:opacity-50"
              >
                <Share2 className="h-4 w-4" />
                Поділитися
              </button>
            </div>
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
    </BlurScrim>
  );
}
