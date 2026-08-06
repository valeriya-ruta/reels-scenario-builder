'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { LabSlide, LabStyleId } from '@/lib/carousel-lab/types';
import { createSlide } from '@/lib/carousel-lab/defaults';
import { saveLabSlides, updateLabStyle, renameLabProject } from '@/app/carousel-lab/actions';
import { downloadSlidePng, downloadProjectZip } from '@/lib/carousel-lab/exportPng';
import LabSlideCanvas from './LabSlideCanvas';
import StyleChooser from './StyleChooser';
import SlideTypePicker from './SlideTypePicker';
import LabFields from './LabFields';

type Props = {
  projectId: string;
  initialName: string;
  initialStyleId: LabStyleId;
  initialSlides: LabSlide[];
};

export default function LabEditor({ projectId, initialName, initialStyleId, initialSlides }: Props) {
  const [slides, setSlides] = useState<LabSlide[]>(
    initialSlides.length ? initialSlides : [createSlide('cover', 'title_subtext')],
  );
  const [styleId, setStyleId] = useState<LabStyleId>(initialStyleId);
  const [name, setName] = useState(initialName);
  const [activeId, setActiveId] = useState(slides[0]?.id ?? '');
  const [save, setSave] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [exporting, setExporting] = useState(false);

  const active = slides.find((s) => s.id === activeId) ?? slides[0];

  // ── autosave (debounced) ────────────────────────────────────────────────
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave('saving');
    const t = setTimeout(async () => {
      await saveLabSlides(projectId, slides);
      await updateLabStyle(projectId, styleId);
      setSave('saved');
    }, 700);
    return () => clearTimeout(t);
  }, [slides, styleId, projectId]);

  const patchActive = useCallback(
    (patch: Partial<LabSlide>) => {
      setSlides((prev) => prev.map((s) => (s.id === active?.id ? { ...s, ...patch } : s)));
    },
    [active?.id],
  );

  function addSlide() {
    const s = createSlide('text', 'paragraph');
    setSlides((prev) => {
      const idx = prev.findIndex((x) => x.id === activeId);
      const next = [...prev];
      next.splice(idx + 1, 0, s);
      return next;
    });
    setActiveId(s.id);
  }
  function deleteSlide(id: string) {
    setSlides((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((s) => s.id === id);
      const next = prev.filter((s) => s.id !== id);
      if (id === activeId) setActiveId(next[Math.max(0, idx - 1)].id);
      return next;
    });
  }
  function move(id: string, dir: -1 | 1) {
    setSlides((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  // ── responsive preview sizing ────────────────────────────────────────────
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(360);
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const bw = el.clientWidth - 24;
      const bh = el.clientHeight - 24;
      const next = Math.max(160, Math.floor(Math.min(bw, (bh * 1080) / 1350)));
      // Guard against ResizeObserver feedback oscillation (ignore sub-2px churn).
      setPreviewW((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function exportActive() {
    if (!active) return;
    setExporting(true);
    try {
      await downloadSlidePng(active, `${name || 'slide'}.png`);
    } finally {
      setExporting(false);
    }
  }
  async function exportAll() {
    setExporting(true);
    try {
      await downloadProjectZip(slides, name || 'carousel');
    } finally {
      setExporting(false);
    }
  }

  const saveLabel = useMemo(
    () => (save === 'saving' ? 'Збереження…' : save === 'saved' ? 'Збережено' : ''),
    [save],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: '#f6f6f4' }}>
      {/* top bar */}
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5">
        <Link href="/carousel-lab" className="text-neutral-500 hover:text-neutral-800" aria-label="Назад">
          ‹ Назад
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => renameLabProject(projectId, name)}
          className="min-w-0 flex-1 rounded-md px-2 py-1 text-[15px] font-semibold outline-none hover:bg-neutral-50 focus:bg-neutral-50"
        />
        <span className="text-[12px] text-neutral-400">{saveLabel}</span>
        <button onClick={exportActive} disabled={exporting} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 disabled:opacity-50">
          Експорт слайду
        </button>
        <button onClick={exportAll} disabled={exporting} className="rounded-lg bg-[#4a6cf7] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
          {exporting ? 'Експорт…' : 'Експорт усіх (ZIP)'}
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* filmstrip */}
        <div className="flex w-[104px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-neutral-200 bg-white p-2">
          {slides.map((s, i) => (
            <div key={s.id} className="group relative">
              <button
                type="button"
                onClick={() => setActiveId(s.id)}
                data-testid={`thumb-${i}`}
                className="block w-full overflow-hidden rounded-md"
                style={{ outline: s.id === activeId ? '2px solid #4a6cf7' : '1px solid #e5e5e5' }}
              >
                <LabSlideCanvas slide={s} renderWidth={84} rounded={4} />
              </button>
              <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
                <button onClick={() => move(s.id, -1)} className="rounded bg-black/50 px-1 text-[10px] text-white">↑</button>
                <button onClick={() => move(s.id, 1)} className="rounded bg-black/50 px-1 text-[10px] text-white">↓</button>
                {slides.length > 1 && (
                  <button onClick={() => deleteSlide(s.id)} className="rounded bg-black/50 px-1 text-[10px] text-white">✕</button>
                )}
              </div>
              <div className="mt-0.5 text-center text-[10px] text-neutral-400">{i + 1}</div>
            </div>
          ))}
          <button
            type="button"
            onClick={addSlide}
            data-testid="add-slide"
            className="rounded-md border border-dashed border-neutral-300 py-3 text-[18px] text-neutral-400 hover:border-[#4a6cf7] hover:text-[#4a6cf7]"
          >
            +
          </button>
        </div>

        {/* preview */}
        <div ref={previewBoxRef} className="flex min-w-0 flex-1 items-center justify-center p-4">
          {active && (
            <LabSlideCanvas slide={active} renderWidth={previewW} rounded={Math.round(previewW * 0.02)} testId="active-preview" />
          )}
        </div>

        {/* panel */}
        <div className="w-[380px] shrink-0 overflow-y-auto border-l border-neutral-200 bg-white p-4">
          <StyleChooser value={styleId} onSelect={setStyleId} />
          <div className="my-4 h-px bg-neutral-100" />
          {active && <SlideTypePicker slide={active} onChange={patchActive} />}
          <div className="my-4 h-px bg-neutral-100" />
          {active && <LabFields slide={active} projectId={projectId} onChange={patchActive} />}
        </div>
      </div>
    </div>
  );
}
