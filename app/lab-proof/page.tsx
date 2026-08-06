'use client';

// Dev-only robustness harness (no auth): empty states, max-length overflow,
// image-fit (contain vs cover), and Ukrainian Cyrillic edge cases.

import { useEffect } from 'react';
import LabSlideCanvas from '@/components/carousel-lab/LabSlideCanvas';
import { EXTRA_SAMPLES } from '@/lib/carousel-lab/proofExtras';
import { slideToPngDataUrl } from '@/lib/carousel-lab/exportPng';
import type { LabSlide } from '@/lib/carousel-lab/types';

export default function LabProofPage() {
  useEffect(() => {
    const map = new Map(EXTRA_SAMPLES.map((s) => [s.key, s.slide as LabSlide]));
    (window as unknown as Record<string, unknown>).__labExtraExportPng = async (key: string) => {
      const slide = map.get(key);
      if (!slide) return null;
      try {
        return await slideToPngDataUrl(slide, 1);
      } catch {
        return null;
      }
    };
    (window as unknown as Record<string, unknown>).__labExtraKeys = EXTRA_SAMPLES.map((s) => s.key);
  }, []);

  return (
    <div style={{ background: '#2b2b2b' }}>
      {EXTRA_SAMPLES.map(({ key, slide, note }) => (
        <div key={key}>
          <div style={{ color: '#bbb', font: '12px sans-serif', padding: '4px 8px' }}>{key} — {note}</div>
          <LabSlideCanvas slide={slide as LabSlide} renderWidth={1080} testId={`ex-${key}`} />
        </div>
      ))}
    </div>
  );
}
