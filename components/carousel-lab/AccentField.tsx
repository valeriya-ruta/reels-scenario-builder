'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type El = HTMLTextAreaElement | HTMLInputElement;

/** Viewport coords of the caret at char `pos` in a textarea/input (mirror-div technique). */
function caretCoords(el: El, pos: number): { top: number; left: number; height: number } {
  const isInput = el.tagName === 'INPUT';
  const cs = window.getComputedStyle(el);
  const div = document.createElement('div');
  const s = div.style;
  s.position = 'absolute';
  s.visibility = 'hidden';
  s.whiteSpace = isInput ? 'nowrap' : 'pre-wrap';
  s.wordWrap = 'break-word';
  s.overflow = 'hidden';
  const copy = ['boxSizing', 'width', 'height', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize'] as const;
  copy.forEach((p) => { (s as unknown as Record<string, string>)[p] = cs.getPropertyValue(p.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())); });
  div.textContent = el.value.substring(0, pos);
  if (isInput) div.textContent = (div.textContent ?? '').replace(/\s/g, ' ');
  const span = document.createElement('span');
  span.textContent = el.value.substring(pos) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const rect = el.getBoundingClientRect();
  const top = rect.top + span.offsetTop - el.scrollTop;
  const left = rect.left + span.offsetLeft - el.scrollLeft;
  const height = parseInt(cs.lineHeight) || parseInt(cs.fontSize) || 18;
  document.body.removeChild(div);
  return { top, left, height };
}

export default function AccentField({
  value,
  onChange,
  placeholder,
  multiline,
  rows = 3,
  maxLength,
  inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  inputClassName?: string;
}) {
  const ref = useRef<El>(null);
  const [tb, setTb] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const refresh = useCallback(() => {
    const el = ref.current;
    if (!el || document.activeElement !== el) { setTb(null); return; }
    const s = el.selectionStart;
    const e = el.selectionEnd;
    if (s == null || e == null || s === e) { setTb(null); return; }
    const c = caretCoords(el, Math.round((s + e) / 2));
    setTb({ top: c.top, left: c.left });
  }, []);

  useEffect(() => {
    const h = () => refresh();
    document.addEventListener('selectionchange', h);
    window.addEventListener('scroll', h, true);
    window.addEventListener('resize', h);
    return () => {
      document.removeEventListener('selectionchange', h);
      window.removeEventListener('scroll', h, true);
      window.removeEventListener('resize', h);
    };
  }, [refresh]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    if (s === e) return;
    const v = value;
    let nv: string;
    let ns: number;
    let ne: number;
    if (v[s - 1] === '*' && v[e] === '*') {
      nv = v.slice(0, s - 1) + v.slice(s, e) + v.slice(e + 1);
      ns = s - 1;
      ne = e - 1;
    } else {
      // strip any stray asterisks inside the selection, then wrap it
      const inner = v.slice(s, e).replace(/\*/g, '');
      nv = v.slice(0, s) + '*' + inner + '*' + v.slice(e);
      ns = s + 1;
      ne = s + 1 + inner.length;
    }
    onChange(nv);
    requestAnimationFrame(() => {
      el.focus();
      try { el.setSelectionRange(ns, ne); } catch { /* input types without selection */ }
      refresh();
    });
  };

  const common = {
    ref: ref as React.Ref<never>,
    value,
    placeholder,
    maxLength,
    onChange: (e: React.ChangeEvent<El>) => onChange(e.target.value),
    onSelect: refresh,
    onKeyUp: refresh,
    onMouseUp: refresh,
    onBlur: () => window.setTimeout(() => setTb(null), 200),
    className: inputClassName,
  };

  return (
    <>
      {multiline ? <textarea rows={rows} {...common} /> : <input {...common} />}
      {mounted && tb
        ? createPortal(
            <div style={{ position: 'fixed', top: tb.top - 46, left: tb.left, transform: 'translateX(-50%)', zIndex: 1000 }}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); toggle(); }}
                onTouchStart={(e) => { e.preventDefault(); toggle(); }}
                className="rounded-full bg-zinc-900 px-3.5 py-2 text-[13px] font-semibold text-white shadow-lg"
              >
                Акцент
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
