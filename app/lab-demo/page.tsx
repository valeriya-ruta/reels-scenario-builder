'use client';

// Dev-only PUBLIC editor demo (no auth): drives the real LabEditor with an
// in-memory project so the editor UX, style chooser, type/subtype pickers, live
// preview, and export button can be verified without seeded credentials.
// Server-action autosave no-ops when unauthenticated; client UX + export work.

import LabEditor from '@/components/carousel-lab/LabEditor';
import { SAMPLE_SLIDES } from '@/lib/carousel-lab/defaults';

const KEYS = ['cover-title-subtext', 'text-paragraph', 'text-bullets', 'numbers-stat', 'cta-keyword', 'testimonial-screenshot'];
const slides = KEYS.map((k) => SAMPLE_SLIDES.find((s) => s.key === k)!.slide);

export default function LabDemoPage() {
  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
      <LabEditor projectId="demo" initialName="Демо карусель" initialStyleId="modern-elegant" initialSlides={slides} />
    </div>
  );
}
