'use client';

import { useCallback, useEffect, useState } from 'react';
import { IS_PRO_EDITION } from '@/lib/pro/edition';
import { usePro } from '@/components/pro/ProContext';
import { useToast } from '@/components/ToastProvider';

/**
 * Right-click → "Report a bug". A low-friction feedback capture that grabs the
 * page context automatically (route, clicked element, viewport, edition, active
 * blogger) so there's no screenshotting/copy-pasting. The comment + context is
 * posted to /api/support, which files it as a ClickUp task in the Feature
 * Requests list — the queue a fix gets spun out of.
 *
 * Shared by both editions. Native right-click is preserved on inputs and when
 * text is selected, so copy/paste still works.
 */
type Target = {
  x: number;
  y: number;
  selector: string;
  text: string;
};

function describeElement(el: Element | null): { selector: string; text: string } {
  if (!el) return { selector: '—', text: '' };
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && depth < 4) {
    let seg = node.tagName.toLowerCase();
    const testid = node.getAttribute('data-testid');
    if (node.id) {
      parts.unshift(`${seg}#${node.id}`);
      break;
    }
    if (testid) {
      parts.unshift(`${seg}[data-testid="${testid}"]`);
      break;
    }
    const cls = (node.getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join('.');
    if (cls) seg += `.${cls}`;
    parts.unshift(seg);
    node = node.parentElement;
    depth += 1;
  }
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 140);
  return { selector: parts.join(' › '), text };
}

export default function QuickReport({ userEmail }: { userEmail?: string | null }) {
  const [menu, setMenu] = useState<Target | null>(null);
  const [reporting, setReporting] = useState<Target | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();
  const pro = usePro();

  useEffect(() => {
    function onContext(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      // Preserve the native menu where it matters: form fields + selected text.
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === 'input' ||
        tag === 'textarea' ||
        target?.isContentEditable ||
        (typeof window !== 'undefined' && !!window.getSelection()?.toString());
      if (editable) return;
      e.preventDefault();
      const { selector, text } = describeElement(target);
      // Clamp the menu so it never overflows the viewport edge.
      const x = Math.min(e.clientX, window.innerWidth - 210);
      const y = Math.min(e.clientY, window.innerHeight - 70);
      setMenu({ x, y, selector, text });
    }
    document.addEventListener('contextmenu', onContext);
    return () => document.removeEventListener('contextmenu', onContext);
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);
  useEffect(() => {
    if (!menu) return;
    const close = () => closeMenu();
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, closeMenu]);

  async function send() {
    if (!reporting || !comment.trim()) return;
    setSending(true);
    const edition = IS_PRO_EDITION ? 'Pro (operator)' : 'Customer';
    const blogger = pro.activeProject ? pro.activeProject.name : IS_PRO_EDITION ? 'All / Dashboard' : '—';
    const description = [
      comment.trim(),
      '',
      '— — — auto-captured — — —',
      `Edition: ${edition}`,
      `Blogger: ${blogger}`,
      `Element: ${reporting.selector}`,
      reporting.text ? `Element text: “${reporting.text}”` : null,
      `Viewport: ${window.innerWidth}×${window.innerHeight}`,
    ]
      .filter(Boolean)
      .join('\n');

    const fd = new FormData();
    fd.append('description', description);
    fd.append(
      'metadata',
      JSON.stringify({
        email: userEmail ?? '',
        route: window.location.pathname + window.location.search,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '—',
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      }),
    );

    try {
      const res = await fetch('/api/support', { method: 'POST', body: fd });
      if (res.ok) {
        toast?.pushToast('Дякую! Баг надіслано 🐛', 'success');
        setReporting(null);
        setComment('');
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast?.pushToast(
          data.error === 'support_unconfigured'
            ? 'Звіти не налаштовані (додай CLICKUP_API_TOKEN у Vercel).'
            : 'Не вдалося надіслати. Спробуй ще раз.',
          'error',
        );
      }
    } catch {
      toast?.pushToast('Не вдалося надіслати. Спробуй ще раз.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {menu && (
        <div
          className="fixed z-[200] w-52 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setReporting(menu);
              setComment('');
              setMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
          >
            <span>🐛</span>
            <span className="flex-1">Повідомити про баг</span>
          </button>
          <button
            type="button"
            onClick={closeMenu}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-50"
          >
            <span className="w-[1em]" />
            Скасувати
          </button>
        </div>
      )}

      {reporting && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
          onClick={() => !sending && setReporting(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">🐛 Повідомити про баг</h2>
            <p className="mb-3 text-xs text-zinc-500">
              Контекст (сторінка, елемент, розмір екрана) додається автоматично — просто опиши, що
              не так.
            </p>
            <textarea
              autoFocus
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
              }}
              rows={4}
              placeholder="Що зламалось / що поправити?"
              className="w-full resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
            />
            <div className="mt-1.5 truncate text-[11px] text-zinc-400" title={reporting.selector}>
              {reporting.selector}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReporting(null)}
                disabled={sending}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || !comment.trim()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
              >
                {sending ? 'Надсилаю…' : 'Надіслати'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
