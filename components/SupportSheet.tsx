'use client';

import { useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { ImagePlus, X, Check } from 'lucide-react';

const ACCENT = '#004BA8';
const TELEGRAM_URL = 'https://t.me/valeriya_ruta';

/**
 * In-app support / report-a-problem bottom sheet (task 86d35yft6). On submit it
 * POSTs the description + screenshots + metadata to the server route
 * (/api/support), which creates a ClickUp "Feature requests" task; then fires a
 * lightweight PostHog `support_report_submitted` event and shows the
 * confirmation state. Errors are neutral (zinc) and preserve the user's input.
 */
export default function SupportSheet({
  onClose,
  userId,
  email,
  handle,
}: {
  onClose: () => void;
  userId: string;
  email: string;
  handle: string;
}) {
  const pathname = usePathname();
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = description.trim().length > 0 && !submitting;

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith('image/'));
    setFiles((prev) => [...prev, ...imgs]);
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, j) => j !== i));

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('description', description.trim());
      fd.append(
        'metadata',
        JSON.stringify({
          userId,
          email,
          handle,
          route: pathname,
          appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? 'web',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          timestamp: new Date().toISOString(),
        }),
      );
      files.forEach((f) => fd.append('screenshots', f, f.name));

      const res = await fetch('/api/support', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Lightweight event — no description text (avoid PII bloat).
      try {
        posthog.capture('support_report_submitted', {
          user_id: userId,
          has_screenshots: files.length > 0,
          screenshot_count: files.length,
          route: pathname,
        });
      } catch {
        /* analytics must never block the success state */
      }
      setDone(true);
    } catch {
      setError('Не вдалося надіслати. Спробуй ще раз — твій текст збережено.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Підтримка"
      data-testid="support-sheet"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/50"
        aria-label="Закрити"
        onClick={onClose}
      />
      <div
        className="relative z-[101] w-full max-w-md cursor-default rounded-t-3xl bg-white p-5 pb-8 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-zinc-300" />

        {done ? (
          <div className="flex flex-col items-center text-center" data-testid="support-confirmation">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-7 w-7" strokeWidth={3} />
            </span>
            <p className="mt-4 text-base font-medium leading-relaxed text-zinc-800">
              Дякую дуже! Рута з Claude вже разом дивляться на проблему, і як виправлять
              якнайшвидше!
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: ACCENT }}
            >
              Дякую
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-xl font-semibold text-zinc-900">
              Повідомити про проблему
            </h2>
            <p className="mt-1 text-sm text-zinc-600">Опиши, що сталося — ми розберемось</p>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Що пішло не так?"
              rows={4}
              data-testid="support-description"
              className="mt-4 w-full resize-none rounded-xl border border-[color:var(--border)] bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none focus:border-[color:var(--accent)]"
            />

            {/* Screenshot upload zone */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 transition hover:bg-[color:var(--surface)]"
            >
              <ImagePlus className="h-4 w-4" />
              Додати скріншоти
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              data-testid="support-file-input"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {files.length > 0 ? (
              <ul className="mt-3 space-y-2" data-testid="support-screenshots">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg bg-[color:var(--surface)] px-3 py-2 text-xs text-zinc-700"
                  >
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`Прибрати ${f.name}`}
                      className="shrink-0 rounded p-1 text-zinc-500 hover:bg-white hover:text-zinc-800"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {error ? (
              <p className="mt-3 text-sm text-zinc-600" role="alert" data-testid="support-error">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              data-testid="support-submit"
              className="mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {submitting ? 'Надсилаємо…' : 'Надіслати'}
            </button>

            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex w-full items-center justify-center rounded-xl border border-[color:var(--border)] bg-white px-4 py-3 text-sm font-medium text-zinc-800 transition hover:bg-[color:var(--surface)]"
            >
              Написати Руті про це
            </a>
          </>
        )}
      </div>
    </div>
  );
}
