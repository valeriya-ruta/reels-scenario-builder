'use client';

import { useEffect, useMemo, useState } from 'react';
import { LAB_CANVAS_W, LAB_CANVAS_H, type LabSlide } from '@/lib/carousel-lab/types';
import { buildSlideSvg } from '@/lib/carousel-lab/buildSlideSvg';
import { getMeasurer } from '@/lib/carousel-lab/measure';
import { ensureLabFontsLoaded } from '@/lib/carousel-lab/fonts';
import { resolveImageSrc } from '@/lib/carousel-lab/imageResolve';

let fontsReadyPromise: Promise<void> | null = null;
function fontsReady(): Promise<void> {
  if (!fontsReadyPromise) fontsReadyPromise = ensureLabFontsLoaded();
  return fontsReadyPromise;
}

/** Hook: true once GoogleSansElegant is loaded so measurement is accurate. */
export function useLabFontsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    fontsReady().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return ready;
}

type Props = {
  slide: LabSlide;
  /** Rendered footprint width in CSS px (height derives from the 1080×1350 ratio). */
  renderWidth: number;
  className?: string;
  rounded?: number;
  /** data-testid on the rendered slide box (for Playwright). */
  testId?: string;
};

export default function LabSlideCanvas({ slide, renderWidth, className, rounded = 0, testId }: Props) {
  const ready = useLabFontsReady();
  const height = Math.round((renderWidth * LAB_CANVAS_H) / LAB_CANVAS_W);

  const svg = useMemo(() => {
    if (!ready) return '';
    const measure = getMeasurer();
    const raw = buildSlideSvg(slide, { measure, imageSrc: resolveImageSrc });
    // size the inline SVG to the footprint; viewBox keeps geometry
    return raw.replace(
      `width="${LAB_CANVAS_W}" height="${LAB_CANVAS_H}"`,
      `width="${renderWidth}" height="${height}" style="display:block"`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, renderWidth, height, ready]);

  return (
    <div
      className={className}
      data-testid={testId}
      data-slide-ready={ready ? '1' : '0'}
      style={{
        width: renderWidth,
        height,
        borderRadius: rounded,
        overflow: 'hidden',
        background: '#BCC7AB',
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
