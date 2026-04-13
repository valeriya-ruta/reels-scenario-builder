'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabaseClient';
import type { BrandSettings, BrandTheme, BrandVibe } from '@/lib/brand';

interface BrandSettingsRow {
  theme: BrandTheme;
  vibe: BrandVibe;
  fav_color_hex: string;
  color_light_bg: string;
  color_dark_bg: string;
  color_accent1: string;
  color_accent2: string;
  title_font: string;
  body_font: string;
}

interface BrandStore {
  brandSettings: BrandSettings | null;
  loading: boolean;
  refetchBrand: () => Promise<void>;
  setBrandSettings: (v: BrandSettings | null) => void;
}

const BrandContext = createContext<BrandStore | null>(null);

function mapRow(row: BrandSettingsRow): BrandSettings {
  return {
    theme: row.theme,
    vibe: row.vibe,
    favColorHex: row.fav_color_hex,
    colors: {
      lightBg: row.color_light_bg,
      darkBg: row.color_dark_bg,
      accent1: row.color_accent1,
      accent2: row.color_accent2,
    },
    titleFont: row.title_font,
    bodyFont: row.body_font,
  };
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brandSettings, setBrandSettings] = useState<BrandSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refetchBrand = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    const { data, error } = await supabase
      .from('brand_settings')
      .select(
        'theme,vibe,fav_color_hex,color_light_bg,color_dark_bg,color_accent1,color_accent2,title_font,body_font',
      )
      .maybeSingle<BrandSettingsRow>();
    if (error) {
      console.error('Failed to load brand settings:', error);
      setBrandSettings(null);
      setLoading(false);
      return;
    }
    setBrandSettings(data ? mapRow(data) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refetchBrand();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refetchBrand]);

  const value = useMemo(
    () => ({ brandSettings, loading, refetchBrand, setBrandSettings }),
    [brandSettings, loading, refetchBrand],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrandStore() {
  const ctx = useContext(BrandContext);
  if (!ctx) {
    throw new Error('useBrandStore must be used within BrandProvider');
  }
  return ctx;
}
