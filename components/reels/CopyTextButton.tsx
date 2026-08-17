'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Copy a block of spoken text out of the page.
 *
 * The script is read from a teleprompter, not from this page — so the text is
 * only useful once it is somewhere else. Selecting five paragraphs by hand on
 * the way to that app is the kind of small friction that makes people stop
 * using the plan.
 */
export default function CopyTextButton({
  text,
  label = 'Копіювати',
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard is refused in some embedded browsers; the old way still works.
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(el);
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={copy}
      data-testid="copy-text"
      aria-label={label}
      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] border border-[color:var(--border)] bg-[color:var(--background)] px-2.5 py-1 text-[11.5px] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--foreground)]"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.6} />
          Скопійовано
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" strokeWidth={1.9} />
          {label}
        </>
      )}
    </button>
  );
}
