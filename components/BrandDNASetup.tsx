'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { colornames as colorNames } from 'color-name-list';
import didYouMean, { ThresholdTypeEnums } from 'didyoumean2';
import { createClient } from '@/lib/supabaseClient';
import {
  ACCENT2_VARIANT_COUNT,
  computeBrandPalette,
  hslToHex,
  hexToHsl,
  normalizeHex,
  pickNextAccent2Variant,
  type BrandAccentStyle,
  type BrandSettings,
  type BrandTheme,
  type BrandVibe,
} from '@/lib/brand';
import { parseAccentSegments } from '@/lib/accentBracketText';
import { AccentSpan } from '@/components/carousel/AccentStyledSpans';
import { BODY_FALLBACK_FONT, getDefaultFontForVibe, resolveBrandFont } from '@/lib/brandFonts';
import { loadBrandFontsCatalog, loadGoogleFont } from '@/lib/loadGoogleFont';
import { FontSelector } from '@/components/FontSelector';
import { useToast } from '@/components/ToastProvider';

type ScreenStep = 1 | 2;
type PaletteKey = 'lightBg' | 'darkBg' | 'accent1' | 'accent2';

interface Props {
  initialValues?: BrandSettings | null;
  editMode?: boolean;
  /** After explicit "Зберегти бренд DNA" success. */
  onComplete?: () => void;
  /** After any successful persist (including accent auto-save). */
  onBrandUpdated?: () => void;
}

const DEFAULT_FAV = '#FF6B6B';

const ACCENT_STYLE_ONBOARDING: { id: BrandAccentStyle; label: string }[] = [
  { id: 'marker', label: 'Маркер' },
  { id: 'pill', label: 'Пілюля' },
  { id: 'rectangle', label: 'Прямокутник' },
  { id: 'bold', label: 'Жирний' },
  { id: 'italic', label: 'Курсив' },
];

/** Sample line for accent-style previews (`{…}` matches carousel syntax). */
const ACCENT_STYLE_DEMO_TEXT = 'Текст з {акцентом}';

function normalizeColorText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const LOCAL_COLOR_ALIASES: Record<string, string> = {
  червоний: '#FF0000',
  червона: '#FF0000',
  красный: '#FF0000',
  синій: '#0000FF',
  синя: '#0000FF',
  голубий: '#87CEEB',
  блакитний: '#87CEEB',
  синий: '#0000FF',
  голубой: '#87CEEB',
  зелений: '#008000',
  зелена: '#008000',
  зеленый: '#008000',
  жовтий: '#FFFF00',
  жовта: '#FFFF00',
  желтый: '#FFFF00',
  помаранчевий: '#FFA500',
  оранжевий: '#FFA500',
  оранжевый: '#FFA500',
  фіолетовий: '#800080',
  фіолетова: '#800080',
  фиолетовый: '#800080',
  рожевий: '#FFC0CB',
  рожева: '#FFC0CB',
  'яскраво рожевий': '#FF69B4',
  'яскраво рожева': '#FF69B4',
  'ярко розовый': '#FF69B4',
  'hot pink': '#FF69B4',
  розовий: '#FFC0CB',
  розовый: '#FFC0CB',
  білий: '#FFFFFF',
  біла: '#FFFFFF',
  белый: '#FFFFFF',
  чорний: '#000000',
  чорна: '#000000',
  черный: '#000000',
  сірий: '#808080',
  сіра: '#808080',
  серый: '#808080',
  коричневий: '#8B4513',
  коричневийй: '#8B4513',
  коричневый: '#8B4513',
  бірюзовий: '#40E0D0',
  бірюзова: '#40E0D0',
  бирюзовый: '#40E0D0',
  мятний: '#98FF98',
  мятный: '#98FF98',
  лаймовий: '#32CD32',
  лаймовый: '#32CD32',
  смарагдовий: '#008F5A',
  смарагдова: '#008F5A',
  изумрудный: '#008F5A',
  emerald: '#50C878',
};

const LOCAL_COLOR_ROOTS: Array<{ tokens: string[]; hex: string }> = [
  { tokens: ['червон', 'красн', 'red'], hex: '#FF0000' },
  { tokens: ['рож', 'розов', 'pink'], hex: '#FFC0CB' },
  { tokens: ['пурпур', 'magenta', 'фукс'], hex: '#FF00FF' },
  { tokens: ['син', 'blue'], hex: '#0000FF' },
  { tokens: ['блакит', 'голуб', 'cyan', 'sky'], hex: '#87CEEB' },
  { tokens: ['бірюз', 'бирюз', 'turquoise', 'teal'], hex: '#40E0D0' },
  { tokens: ['зелен', 'green'], hex: '#008000' },
  { tokens: ['смарагд', 'изумруд', 'emerald'], hex: '#50C878' },
  { tokens: ['лайм', 'lime'], hex: '#32CD32' },
  { tokens: ['мят', 'mint'], hex: '#98FF98' },
  { tokens: ['жовт', 'желт', 'yellow'], hex: '#FFFF00' },
  { tokens: ['помаранч', 'оранж', 'orange'], hex: '#FFA500' },
  { tokens: ['фіолет', 'фиолет', 'violet', 'purple'], hex: '#800080' },
  { tokens: ['коричн', 'brown'], hex: '#8B4513' },
  { tokens: ['сір', 'сер', 'gray', 'grey'], hex: '#808080' },
  { tokens: ['чорн', 'черн', 'black'], hex: '#000000' },
  { tokens: ['бі', 'бел', 'white'], hex: '#FFFFFF' },
];

function resolveLocalDescriptiveColor(normalizedInput: string): string | null {
  const words = normalizedInput.split(' ').filter(Boolean);
  const root = LOCAL_COLOR_ROOTS.find(({ tokens }) =>
    tokens.some((token) => words.some((w) => w.includes(token))),
  );
  if (!root) return null;

  let [h, s, l] = hexToHsl(root.hex);
  const has = (fragments: string[]) =>
    fragments.some((fragment) => words.some((w) => w.includes(fragment)));

  const bright = has(['яскрав', 'ярк', 'насич', 'vivid', 'bright']);
  const light = has(['світл', 'светл', 'light']);
  const dark = has(['темн', 'тёмн', 'dark', 'глибок']);
  const pastel = has(['пастел', 'ніжн', 'нежн', 'soft']);
  const neon = has(['неон', 'neon']);
  const muted = has(['приглуш', 'приглушен', 'muted', 'dusty']);
  const warm = has(['тепл', 'warm']);
  const cool = has(['холод', 'cold', 'cool']);

  if (bright) {
    s = clamp(s + 18, 0, 100);
    l = clamp(l + 6, 0, 100);
  }
  if (light) {
    l = clamp(l + 18, 0, 100);
    s = clamp(s - 8, 0, 100);
  }
  if (dark) {
    l = clamp(l - 18, 0, 100);
    s = clamp(s + 6, 0, 100);
  }
  if (pastel) {
    l = clamp(l + 16, 0, 100);
    s = clamp(s - 22, 0, 100);
  }
  if (neon) {
    s = clamp(s + 25, 0, 100);
    l = clamp(l + 2, 0, 100);
  }
  if (muted) {
    s = clamp(s - 20, 0, 100);
  }
  if (warm) {
    h = (h + 8) % 360;
  }
  if (cool) {
    h = (h + 352) % 360;
  }

  return hslToHex(h, s, l);
}

function resolveColorToHex(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_FAV;
  if (/^#?[0-9a-fA-F]{3,8}$/.test(trimmed)) return normalizeHex(trimmed);
  const normalizedInput = normalizeColorText(trimmed);

  const directAlias = LOCAL_COLOR_ALIASES[normalizedInput];
  if (directAlias) {
    return normalizeHex(directAlias);
  }

  const descriptiveLocal = resolveLocalDescriptiveColor(normalizedInput);
  if (descriptiveLocal) {
    return normalizeHex(descriptiveLocal);
  }

  const closestAlias = didYouMean(normalizedInput, Object.keys(LOCAL_COLOR_ALIASES), {
    thresholdType: ThresholdTypeEnums.SIMILARITY,
    threshold: 0.62,
  }) as string | null;
  if (closestAlias) {
    return normalizeHex(LOCAL_COLOR_ALIASES[closestAlias]);
  }

  const bestColorName = didYouMean(
    trimmed,
    colorNames.map((color) => color.name),
    {
    thresholdType: ThresholdTypeEnums.SIMILARITY,
    threshold: 0.2,
    },
  ) as string | null;
  const best = bestColorName
    ? colorNames.find((color) => color.name === bestColorName)
    : null;
  return best?.hex ? normalizeHex(best.hex) : DEFAULT_FAV;
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-xl border px-4 py-3 text-left text-sm font-medium transition',
        active
          ? 'border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent)]'
          : 'border-[color:var(--border)] bg-white text-zinc-700 hover:bg-[color:var(--surface)]',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export default function BrandDNASetup({
  initialValues,
  editMode = false,
  onComplete,
  onBrandUpdated,
}: Props) {
  const [step, setStep] = useState<ScreenStep>(() => (editMode && initialValues ? 2 : 1));
  const [theme, setTheme] = useState<BrandTheme>(initialValues?.theme ?? 'light');
  const [vibe, setVibe] = useState<BrandVibe>(initialValues?.vibe ?? 'bold');
  const [favHex, setFavHex] = useState(initialValues?.favColorHex ?? DEFAULT_FAV);
  const [colorInput, setColorInput] = useState(initialValues?.favColorHex ?? DEFAULT_FAV);
  const [overrides, setOverrides] = useState<Partial<Record<PaletteKey, string>>>(
    initialValues
      ? {
          lightBg: initialValues.colors.lightBg,
          darkBg: initialValues.colors.darkBg,
          accent1: initialValues.colors.accent1,
          accent2: initialValues.colors.accent2,
        }
      : {},
  );
  const [saving, setSaving] = useState(false);
  const [fontId, setFontId] = useState<string>(() => initialValues?.fontId ?? 'montserrat');
  const [accentStyle, setAccentStyle] = useState<BrandAccentStyle>(
    () => initialValues?.accentStyle ?? 'marker',
  );
  /** Which accent2 harmonic recipe is active (0…ACCENT2_VARIANT_COUNT-1). Resets when starting a new step-1→2 run. */
  const [accent2VariantIndex, setAccent2VariantIndex] = useState(0);
  const [accentRefreshSpinKey, setAccentRefreshSpinKey] = useState(0);
  const [accentJustSaved, setAccentJustSaved] = useState(false);
  const accentAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (initialValues?.fontId) {
      setFontId(initialValues.fontId);
    }
  }, [initialValues?.fontId]);

  useEffect(() => {
    if (initialValues?.accentStyle != null) {
      setAccentStyle(initialValues.accentStyle);
    }
  }, [initialValues?.accentStyle]);

  useEffect(() => {
    loadBrandFontsCatalog();
  }, []);

  useEffect(() => {
    return () => {
      if (accentAutoSaveTimerRef.current) {
        clearTimeout(accentAutoSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!accentJustSaved) return;
    const t = window.setTimeout(() => setAccentJustSaved(false), 1500);
    return () => clearTimeout(t);
  }, [accentJustSaved]);

  useEffect(() => {
    loadGoogleFont(resolveBrandFont(fontId));
  }, [fontId]);

  useEffect(() => {
    const trimmed = colorInput.trim();
    // Valid 6-digit hex: apply immediately so preview and palette match the picker/text field
    // without waiting for debounce (avoids stale DEFAULT_FAV when continuing to step 2).
    if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
      setFavHex(normalizeHex(trimmed));
      return;
    }
    const timeout = window.setTimeout(() => {
      const resolved = resolveColorToHex(colorInput);
      setFavHex(resolved);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [colorInput]);

  const palette = useMemo(
    () =>
      computeBrandPalette(favHex, theme, vibe, {
        lightBg: overrides.lightBg,
        darkBg: overrides.darkBg,
        accent1: overrides.accent1,
        accent2: overrides.accent2,
      }),
    [favHex, theme, vibe, overrides],
  );
  const brandFont = useMemo(() => resolveBrandFont(fontId), [fontId]);

  const persistRef = useRef({
    theme,
    vibe,
    favHex,
    fontId,
    palette,
    accentStyle,
  });
  persistRef.current = {
    theme,
    vibe,
    favHex,
    fontId,
    palette,
    accentStyle,
  };

  const upsertBrandSettings = useCallback(async (): Promise<boolean> => {
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    if (!currentUser) {
      toast?.pushToast('Сесія завершилась. Увійди ще раз.', 'error');
      return false;
    }

    const { theme: t, vibe: v, favHex: fav, fontId: fid, palette: pal, accentStyle: ast } =
      persistRef.current;

    const payload = {
      user_id: currentUser.id,
      theme: t,
      vibe: v,
      fav_color_hex: fav,
      color_light_bg: pal.lightBg,
      color_dark_bg: pal.darkBg,
      color_accent1: pal.accent1,
      color_accent2: pal.accent2,
      font_id: fid,
    };

    const [brandRes, profileRes] = await Promise.all([
      supabase.from('brand_settings').upsert(payload, { onConflict: 'user_id' }),
      supabase.from('profiles').upsert(
        { id: currentUser.id, accent_style: ast },
        { onConflict: 'id' },
      ),
    ]);

    if (brandRes.error) {
      console.error('brand_settings upsert failed:', brandRes.error);
      const msg = brandRes.error.message ?? '';
      const staleSchema =
        msg.includes('schema cache') ||
        (msg.includes('font_id') && msg.includes('Could not find'));
      if (staleSchema) {
        toast?.pushToast(
          'Supabase API не бачить колонку font_id (кеш PostgREST). У Dashboard → SQL виконай: NOTIFY pgrst, \'reload schema\'; Потім збережи знову. Якщо не допоможе — перевір, що в таблиці brand_settings є колонка font_id.',
          'error',
        );
      } else {
        toast?.pushToast(`Не вдалося зберегти Brand DNA: ${msg}`, 'error');
      }
      return false;
    }
    if (profileRes.error) {
      console.error('profiles accent_style upsert failed:', profileRes.error);
      toast?.pushToast(`Не вдалося зберегти стиль акценту: ${profileRes.error.message ?? ''}`, 'error');
      return false;
    }
    return true;
  }, [toast]);

  const scheduleAccentAutoSave = useCallback(() => {
    if (accentAutoSaveTimerRef.current) {
      clearTimeout(accentAutoSaveTimerRef.current);
    }
    accentAutoSaveTimerRef.current = setTimeout(() => {
      accentAutoSaveTimerRef.current = null;
      void (async () => {
        const ok = await upsertBrandSettings();
        if (ok) {
          onBrandUpdated?.();
          setAccentJustSaved(true);
        }
      })();
    }, 600);
  }, [onBrandUpdated, upsertBrandSettings]);

  const save = async () => {
    setSaving(true);
    const ok = await upsertBrandSettings();
    setSaving(false);
    if (ok) {
      onComplete?.();
    }
  };

  const handleAccent2Refresh = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAccentRefreshSpinKey((k) => k + 1);
    const { accent2, variantIndex } = pickNextAccent2Variant(
      palette.accent1,
      vibe,
      palette.lightBg,
      palette.darkBg,
      accent2VariantIndex,
    );
    setAccent2VariantIndex(variantIndex);
    setOverrides((prev) => ({ ...prev, accent2 }));
    scheduleAccentAutoSave();
  };

  if (step === 1) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <h1 className="font-display text-2xl font-semibold text-zinc-900">Brand DNA</h1>
        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5">
          <p className="mb-3 text-sm font-medium text-zinc-900">Яка тема тобі ближче?</p>
          <div className="grid gap-2">
            <ChoiceButton active={theme === 'light'} onClick={() => setTheme('light')}>☀️ Світла</ChoiceButton>
            <ChoiceButton active={theme === 'dark'} onClick={() => setTheme('dark')}>🌙 Темна</ChoiceButton>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5">
          <p className="mb-3 text-sm font-medium text-zinc-900">Який стиль тобі підходить?</p>
          <div className="grid gap-2">
            <ChoiceButton active={vibe === 'bold'} onClick={() => setVibe('bold')}>
              ⚡ Сміливий і молодий
            </ChoiceButton>
            <ChoiceButton active={vibe === 'refined'} onClick={() => setVibe('refined')}>
              🌿 Рафінований і спокійний
            </ChoiceButton>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5">
          <p className="mb-3 text-sm font-medium text-zinc-900">Який твій улюблений колір?</p>
          <div className="flex items-center gap-3">
            <input
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              onBlur={() => setColorInput(resolveColorToHex(colorInput))}
              placeholder="наприклад: coral, dark cherry, #CC3333..."
              className="min-w-0 flex-1 rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
            />
            <label
              className="relative inline-flex h-10 w-10 cursor-pointer rounded-md border border-[color:var(--border)]"
              style={{ backgroundColor: favHex }}
              title="Обрати колір"
            >
              <input
                type="color"
                value={favHex}
                onChange={(e) => {
                  const next = normalizeHex(e.target.value);
                  setFavHex(next);
                  setColorInput(next);
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5">
          <p className="mb-3 text-sm font-medium text-zinc-900">Як виділяти акценти в тексті?</p>
          <p className="mb-3 text-xs leading-relaxed text-zinc-500">
            Обери, як виглядатиме текст у фігурних дужках <code className="text-zinc-600">{'{…}'}</code> у каруселях.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ACCENT_STYLE_ONBOARDING.map(({ id, label }) => {
              const demoColor = palette.accent1Safe;
              const segments = parseAccentSegments(ACCENT_STYLE_DEMO_TEXT);
              return (
                <ChoiceButton key={id} active={accentStyle === id} onClick={() => setAccentStyle(id)}>
                  <span className="block text-sm font-medium text-zinc-900">{label}</span>
                  <span className="mt-2 block text-[13px] leading-snug text-zinc-600">
                    {segments.map((seg, i) =>
                      seg.kind === 'accent' ? (
                        <AccentSpan key={i} style={id} accentColor={demoColor}>
                          {seg.text}
                        </AccentSpan>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      ),
                    )}
                  </span>
                </ChoiceButton>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            const resolved = resolveColorToHex(colorInput);
            setFavHex(resolved);
            setColorInput(resolved);
            setFontId(getDefaultFontForVibe(vibe));
            // Clear color overrides so the palette is re-derived from the freshly chosen
            // favorite color, theme and vibe. Without this, stale accent1/accent2 from
            // initialValues (edit mode) or a previous session win over the new favHex
            // because computeBrandPalette prefers overrides.
            setOverrides({});
            setAccent2VariantIndex(0);
            setStep(2);
          }}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.97]"
          style={{ backgroundColor: palette.accent1Safe }}
        >
          Згенерувати мій бренд →
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {!editMode && (
        <button
          type="button"
          onClick={() => setStep(1)}
          className="mb-4 text-sm font-medium text-zinc-700 hover:text-zinc-900"
        >
          ← Назад
        </button>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex justify-center">
          <div
            className="relative w-full max-w-[360px] overflow-hidden rounded-2xl border border-[color:var(--border)] p-6 shadow-sm"
            style={{ aspectRatio: '4 / 5', backgroundColor: palette.bg }}
          >
            <div className="mb-4 h-1.5 w-16 rounded-full" style={{ backgroundColor: palette.accent2Safe }} />
            <h3
              className="text-2xl leading-tight"
              style={{
                color: vibe === 'bold' ? palette.accent1Safe : palette.mainText,
                fontFamily: `'${brandFont.label}', sans-serif`,
                fontWeight: brandFont.titleWeight,
                fontStyle: brandFont.titleStyle,
              }}
            >
              Твій бренд готовий
            </h3>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{
                color: palette.mainText,
                fontFamily: brandFont.bodyAvailable
                  ? `'${brandFont.label}', sans-serif`
                  : `'${BODY_FALLBACK_FONT}', sans-serif`,
                fontWeight: '400',
              }}
            >
              Це превʼю того, як виглядатимуть твої каруселі в Ruta.
            </p>
            <div
              className="absolute bottom-5 right-5 flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
              style={{ backgroundColor: palette.accent2Safe, color: palette.bg }}
            >
              01
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5">
            <p className="mb-3 text-sm font-medium text-zinc-900">Твої 4 кольори бренду — натисни щоб змінити</p>
            <div className="grid grid-cols-4 items-start gap-2">
              {(['lightBg', 'darkBg', 'accent1', 'accent2'] as const).map((key) =>
                key === 'accent2' ? (
                  <div key={key} className="flex min-w-0 flex-col gap-1">
                    <div
                      className="relative h-12 overflow-hidden rounded-lg border border-[color:var(--border)] transition-[background-color] duration-200 ease-out"
                      style={{ backgroundColor: palette.accent2 }}
                    >
                      <input
                        type="color"
                        value={palette.accent2}
                        onChange={(e) => {
                          const next = normalizeHex(e.target.value);
                          setOverrides((prev) => ({ ...prev, accent2: next }));
                        }}
                        className="absolute inset-0 z-[1] cursor-pointer opacity-0"
                        title="accent2"
                        aria-label="Другий акцентний колір"
                      />
                      <button
                        type="button"
                        onClick={handleAccent2Refresh}
                        title="Спробувати інший варіант"
                        className="absolute right-1 top-1 z-[2] flex h-8 min-h-[32px] w-8 min-w-[32px] cursor-pointer items-center justify-center rounded-full border border-black/15 bg-white/95 text-zinc-800 shadow-sm transition-opacity hover:opacity-100 opacity-90"
                      >
                        <RefreshCw
                          key={accentRefreshSpinKey}
                          className={
                            accentRefreshSpinKey === 0
                              ? 'h-5 w-5 shrink-0'
                              : 'accent2-refresh-spin h-5 w-5 shrink-0'
                          }
                          strokeWidth={2}
                          aria-hidden
                        />
                      </button>
                    </div>
                    <p className="text-center text-[11px] leading-tight text-zinc-400">
                      Варіант {accent2VariantIndex + 1} з {ACCENT2_VARIANT_COUNT}
                    </p>
                    <p
                      className={[
                        'min-h-[1rem] text-center text-[11px] leading-tight text-emerald-600 transition-opacity duration-300',
                        accentJustSaved ? 'opacity-100' : 'opacity-0',
                      ].join(' ')}
                      aria-live="polite"
                    >
                      {accentJustSaved ? 'Збережено' : '\u00a0'}
                    </p>
                  </div>
                ) : (
                  <label
                    key={key}
                    className="relative h-12 cursor-pointer rounded-lg border border-[color:var(--border)]"
                    style={{ backgroundColor: palette[key] }}
                    title={key}
                  >
                    <input
                      type="color"
                      value={palette[key]}
                      onChange={(e) => {
                        const next = normalizeHex(e.target.value);
                        setOverrides((prev) => ({ ...prev, [key]: next }));
                      }}
                      className="absolute inset-0 opacity-0"
                    />
                  </label>
                ),
              )}
            </div>
          </div>

          <FontSelector
            selectedFontId={fontId}
            onChange={setFontId}
            accentColor={palette.accent1}
          />

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-xl py-3 text-sm font-semibold transition hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
            style={{ backgroundColor: palette.accent1Safe, color: palette.bg }}
          >
            {saving ? 'Зберігаємо…' : editMode ? 'Оновити бренд DNA ✓' : 'Зберегти бренд DNA ✓'}
          </button>
          {editMode && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mx-auto block text-xs font-medium text-zinc-500 transition hover:text-zinc-700"
            >
              Створити інший
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
