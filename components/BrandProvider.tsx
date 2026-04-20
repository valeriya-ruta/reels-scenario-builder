'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabaseClient';
import type { BrandSettings, BrandTheme, BrandVibe } from '@/lib/brand';
import { normalizeAccentStyle } from '@/lib/brand';
import { loadBrandFontsCatalog, loadGoogleFont } from '@/lib/loadGoogleFont';
import { resolveBrandFont } from '@/lib/brandFonts';

interface BrandSettingsRow {
  theme: BrandTheme;
  vibe: BrandVibe;
  fav_color_hex: string;
  color_light_bg: string;
  color_dark_bg: string;
  color_accent1: string;
  color_accent2: string;
  font_id: string;
}

interface BrandStore {
  brandSettings: BrandSettings | null;
  loading: boolean;
  refetchBrand: () => Promise<void>;
  setBrandSettings: (v: BrandSettings | null) => void;
}

const BrandContext = createContext<BrandStore | null>(null);

function mapRow(row: BrandSettingsRow, accentFromProfile: string | null | undefined): BrandSettings {
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
    fontId: row.font_id,
    accentStyle: normalizeAccentStyle(accentFromProfile),
  };
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brandSettings, setBrandSettings] = useState<BrandSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refetchBrand = useCallback(async () => {
    const supabase = createClient();
    // Do not set loading=true here: when the user has no brand row yet, CarouselPageClient
    // shows BrandDNASetup only while !loading — toggling loading would unmount the wizard
    // and discard theme/color choices mid-flow.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id;

    const [brandRes, profileRes] = await Promise.all([
      supabase
        .from('brand_settings')
        .select(
          'theme,vibe,fav_color_hex,color_light_bg,color_dark_bg,color_accent1,color_accent2,font_id',
        )
        .maybeSingle<BrandSettingsRow>(),
      uid
        ? supabase.from('profiles').select('accent_style').eq('id', uid).maybeSingle<{ accent_style: string | null }>()
        : Promise.resolve({ data: null as { accent_style: string | null } | null, error: null }),
    ]);

    if (brandRes.error) {
      console.error('Failed to load brand settings:', brandRes.error);
      setBrandSettings(null);
      setLoading(false);
      return;
    }
    if (profileRes.error) {
      console.error('Failed to load profile accent_style:', profileRes.error);
    }
    const accentFromProfile = profileRes.data?.accent_style;
    setBrandSettings(brandRes.data ? mapRow(brandRes.data, accentFromProfile) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refetchBrand();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refetchBrand]);

  useEffect(() => {
    if (!brandSettings) return;
    loadBrandFontsCatalog();
    loadGoogleFont(resolveBrandFont(brandSettings.fontId));
  }, [brandSettings]);

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
