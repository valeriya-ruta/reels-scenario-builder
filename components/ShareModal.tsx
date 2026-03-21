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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">Посилання для поділу</h2>
          <button
            onClick={onClose}
            className="cursor-pointer text-zinc-600 hover:text-zinc-900"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700">
              Посилання для актора (Режим зйомки)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={actorLink}
                readOnly
                className="flex-1 rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
              />
              <button
                onClick={() => copyToClipboard(actorLink, 'actor')}
                className="cursor-pointer rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
              >
                {copied === 'actor' ? 'Скопійовано!' : 'Копіювати'}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700">
              Посилання для редактора (Режим редагування)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editorLink}
                readOnly
                className="flex-1 rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
              />
              <button
                onClick={() => copyToClipboard(editorLink, 'editor')}
                className="cursor-pointer rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
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
