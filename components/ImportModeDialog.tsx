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
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-zinc-900">Імпорт сцен</h3>
        <p className="mt-2 text-sm text-zinc-600">
          Обери, як вставити сцени з референсу.
        </p>

        <div className="mt-4 space-y-2">
          <button
            disabled={disabled}
            onClick={() => onConfirm('replace')}
            className="w-full rounded border border-zinc-300 px-4 py-2 text-left text-sm text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Замінити всі поточні сцени
          </button>
          <button
            disabled={disabled}
            onClick={() => onConfirm('append')}
            className="w-full rounded border border-zinc-300 px-4 py-2 text-left text-sm text-zinc-800 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Додати в кінець поточного сценарію
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            disabled={disabled}
            className="rounded px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
}
