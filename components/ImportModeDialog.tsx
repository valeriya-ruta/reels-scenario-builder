'use client';

type ImportMode = 'replace' | 'append';

interface ImportModeDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: ImportMode) => void;
  disabled?: boolean;
}

export default function ImportModeDialog({
  open,
  onClose,
  onConfirm,
  disabled = false,
}: ImportModeDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card-shadow w-full max-w-md rounded-xl border border-[color:var(--border)] bg-white p-6 shadow-xl">
        <h3 className="font-display text-lg font-semibold text-zinc-900">Імпорт сцен</h3>
        <p className="mt-2 text-sm leading-normal text-zinc-600">
          Обери, як вставити сцени з референсу.
        </p>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onConfirm('replace')}
            className="w-full rounded-lg border border-[color:var(--border)] px-4 py-3 text-left text-sm leading-normal text-zinc-800 transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Замінити всі поточні сцени
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onConfirm('append')}
            className="w-full rounded-lg border border-[color:var(--border)] px-4 py-3 text-left text-sm leading-normal text-zinc-800 transition-colors hover:border-[color:var(--accent)]/40 hover:bg-[color:var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Додати в кінець поточного сценарію
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="rounded-lg px-4 py-2 text-sm leading-normal text-zinc-600 transition-colors hover:bg-[color:var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}
