'use client';

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

/**
 * The address Claude connects to — the whole of the setup, on one card.
 *
 * The URL IS the credential (it carries a signed token), so this is written the
 * way a password is written: hidden until asked for, copied rather than read
 * aloud, and never printed into a screenshot by accident.
 *
 * There is no "generate" button on purpose. A token is derived from the account,
 * so it already exists — a button would only be a ceremony in front of a value
 * that was there the whole time.
 */
export default function McpConnectorCard({ connectorUrl }: { connectorUrl: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!connectorUrl) return;
    try {
      await navigator.clipboard.writeText(connectorUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be denied (non-secure context) — reveal instead.
      setRevealed(true);
    }
  };

  if (!connectorUrl) {
    return (
      <div data-testid="mcp-unconfigured" className="app-card mt-2 p-4">
        <p className="text-base font-semibold text-zinc-900">Ще не увімкнено</p>
        <p className="mt-1.5 text-sm text-zinc-600">
          Підключення до Claude вимкнене на цьому сервері. Потрібно задати змінну
          <span className="mx-1 rounded bg-[color:var(--surface1)] px-1.5 py-0.5 font-mono text-[12px]">
            MCP_TOKEN_SECRET
          </span>
          у налаштуваннях деплою.
        </p>
      </div>
    );
  }

  // Enough of the tail to tell two accounts apart, not enough to use.
  const masked = `${connectorUrl.split('/api/mcp/')[0]}/api/mcp/••••••••${connectorUrl.slice(-4)}`;

  return (
    <div data-testid="mcp-connector" className="app-card mt-2 p-4">
      <p className="text-base font-semibold text-zinc-900">Створюй контент прямо з Claude</p>
      <p className="mt-1.5 text-sm text-zinc-600">
        Додай це посилання як connector у Claude — і зможеш казати «зроби сторітел на четвер», а він
        з’явиться у Плані.
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-[color:var(--border)] bg-[color:var(--surface1)] px-3 py-2.5">
        <code
          data-testid="mcp-url"
          className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-700"
        >
          {revealed ? connectorUrl : masked}
        </code>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? 'Сховати' : 'Показати'}
          title={revealed ? 'Сховати' : 'Показати'}
          className="shrink-0 rounded-md p-1.5 text-zinc-500 transition hover:bg-white hover:text-zinc-800"
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={copy}
          data-testid="mcp-copy"
          aria-label="Скопіювати посилання"
          title={copied ? 'Скопійовано' : 'Скопіювати посилання'}
          className="shrink-0 rounded-md p-1.5 text-zinc-500 transition hover:bg-white hover:text-zinc-800"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.4} />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--text-muted)]">
        Це посилання — ключ від твого акаунта. Не публікуй його. Claude → Settings → Connectors →
        Add custom connector → встав посилання.
      </p>
    </div>
  );
}
