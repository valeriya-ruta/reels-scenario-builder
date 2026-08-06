'use client';

// Dev-only fidelity harness (no auth, no DB) for the Modern Elegant engine.
// Renders every sample slide at 1080px so Playwright can screenshot-diff each
// against its Figma reference and verify editor↔export parity.
// Not linked from the app; safe to remove after the lab ships.

import { useEffect } from 'react';
import LabSlideCanvas from '@/components/carousel-lab/LabSlideCanvas';
import { SAMPLE_SLIDES } from '@/lib/carousel-lab/defaults';
import { slideToPngDataUrl } from '@/lib/carousel-lab/exportPng';
import type { LabSlide } from '@/lib/carousel-lab/types';

export default function LabPreviewPage() {
  useEffect(() => {
    // Expose the export path to Playwright for parity checks.
    const map = new Map(SAMPLE_SLIDES.map((s) => [s.key, s.slide as LabSlide]));
    (window as unknown as Record<string, unknown>).__labExportPng = async (key: string) => {
      const slide = map.get(key);
      if (!slide) return null;
      return await slideToPngDataUrl(slide, 1);
    };
    (window as unknown as Record<string, unknown>).__labKeys = SAMPLE_SLIDES.map((s) => s.key);
    (window as unknown as Record<string, unknown>).__labRefs = Object.fromEntries(
      SAMPLE_SLIDES.map((s) => [s.key, s.ref]),
    );
  }, []);

  return (
    <div style={{ background: '#2b2b2b', padding: 0 }}>
      {SAMPLE_SLIDES.map(({ key, slide }) => (
        <div key={key} style={{ padding: 0, margin: 0 }}>
          <LabSlideCanvas slide={slide as LabSlide} renderWidth={1080} testId={`ed-${key}`} />
        </div>
      ))}
    </div>
  );
}
