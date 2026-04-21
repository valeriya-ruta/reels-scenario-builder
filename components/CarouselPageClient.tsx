'use client';

import { useEffect } from 'react';
import CarouselBuilder from '@/components/CarouselBuilder';
import BrandDNASetup from '@/components/BrandDNASetup';
import { useBrandStore } from '@/components/BrandProvider';
import type { BrandSettings } from '@/lib/brand';
import type { Slide } from '@/lib/carouselTypes';

export default function CarouselPageClient({
  initialBrandSettings,
  carouselProject,
  initialWatermarkHandle,
}: {
  initialBrandSettings: BrandSettings | null;
  carouselProject: { id: string; name: string; slides: Slide[] };
  initialWatermarkHandle: string;
}) {
  const { brandSettings, loading, refetchBrand, setBrandSettings } = useBrandStore();
  const effectiveBrandSettings = brandSettings ?? initialBrandSettings;

  useEffect(() => {
    if (initialBrandSettings && !brandSettings) {
      setBrandSettings(initialBrandSettings);
    }
  }, [initialBrandSettings, brandSettings, setBrandSettings]);

  if (loading && !effectiveBrandSettings) {
    return (
      <div className="flex min-h-[320px] items-center justify-center">
        <div className="text-sm text-zinc-500">Завантаження…</div>
      </div>
    );
  }

  if (!effectiveBrandSettings) {
    return (
      <BrandDNASetup
        onComplete={() => void refetchBrand()}
        onBrandUpdated={() => void refetchBrand()}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CarouselBuilder
        projectId={carouselProject.id}
        initialProjectName={carouselProject.name}
        initialSlides={carouselProject.slides}
        initialWatermarkHandle={initialWatermarkHandle}
      />
    </div>
  );
}
