'use client';

import { useState } from 'react';

interface ShareModalProps {
  actorLink: string;
  editorLink: string;
  onClose: () => void;
}

export default function ShareModal({ actorLink, editorLink, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState<'actor' | 'editor' | null>(null);

  const copyToClipboard = async (text: string, type: 'actor' | 'editor') => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card-shadow w-full max-w-md rounded-xl border border-[color:var(--border)] bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-zinc-900">Посилання для поділу</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-zinc-600 transition-colors hover:bg-[color:var(--surface)] hover:text-zinc-900"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium leading-normal text-zinc-700">
              Посилання для актора (Режим зйомки)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={actorLink}
                readOnly
                className="min-h-[40px] flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm leading-normal text-zinc-900"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(actorLink, 'actor')}
                className="btn-primary shrink-0 rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                {copied === 'actor' ? 'Скопійовано!' : 'Копіювати'}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium leading-normal text-zinc-700">
              Посилання для редактора (Режим редагування)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editorLink}
                readOnly
                className="min-h-[40px] flex-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm leading-normal text-zinc-900"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(editorLink, 'editor')}
                className="btn-primary shrink-0 rounded-lg bg-[color:var(--accent)] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
              >
                {copied === 'editor' ? 'Скопійовано!' : 'Копіювати'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
