'use client';

import { useEffect, useMemo, useState } from 'react';
import { colornames as colorNames } from 'color-name-list';
import didYouMean, { ThresholdTypeEnums } from 'didyoumean2';
import { createClient } from '@/lib/supabaseClient';
import {
  computeBrandPalette,
  getFontsByVibe,
  hslToHex,
  hexToHsl,
  normalizeHex,
  type BrandSettings,
  type BrandTheme,
  type BrandVibe,
} from '@/lib/brand';
import { useToast } from '@/components/ToastProvider';

type ScreenStep = 1 | 2;
type PaletteKey = 'lightBg' | 'darkBg' | 'accent1' | 'accent2';

interface Props {
  initialValues?: BrandSettings | null;
  editMode?: boolean;
  onComplete?: () => void;
}

const DEFAULT_FAV = '#FF6B6B';

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

  const best = didYouMean(trimmed, colorNames, {
    matchPath: ['name'],
    thresholdType: ThresholdTypeEnums.SIMILARITY,
    threshold: 0.2,
  }) as { name: string; hex: string } | null;
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

export default function BrandDNASetup({ initialValues, editMode = false, onComplete }: Props) {
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
  const toast = useToast();

  useEffect(() => {
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
  const fonts = useMemo(() => getFontsByVibe(vibe), [vibe]);

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    if (!currentUser) {
      setSaving(false);
      toast?.pushToast('Сесія завершилась. Увійди ще раз.', 'error');
      return;
    }

    const payload = {
      user_id: currentUser.id,
      theme,
      vibe,
      fav_color_hex: favHex,
      color_light_bg: palette.lightBg,
      color_dark_bg: palette.darkBg,
      color_accent1: palette.accent1,
      color_accent2: palette.accent2,
      title_font: fonts.titleFont,
      body_font: 'Manrope',
    };

    const { error } = await supabase.from('brand_settings').upsert(payload, { onConflict: 'user_id' });
    setSaving(false);

    if (error) {
      // Keep raw DB error visible to speed up onboarding troubleshooting.
      console.error('brand_settings upsert failed:', error);
      toast?.pushToast(`Не вдалося зберегти Brand DNA: ${error.message}`, 'error');
      return;
    }
    onComplete?.();
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

        <button
          type="button"
          onClick={() => {
            const resolved = resolveColorToHex(colorInput);
            setFavHex(resolved);
            setColorInput(resolved);
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
                fontFamily: vibe === 'bold' ? 'Manrope, sans-serif' : '"Cormorant Garamond", serif',
                fontWeight: vibe === 'bold' ? 700 : 600,
                fontStyle: vibe === 'bold' ? 'normal' : 'italic',
              }}
            >
              Твій бренд готовий
            </h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: palette.mainText, fontFamily: 'Manrope, sans-serif' }}>
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
            <div className="grid grid-cols-4 gap-2">
              {(['lightBg', 'darkBg', 'accent1', 'accent2'] as const).map((key) => (
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
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5">
            <p className="mb-3 text-sm font-medium text-zinc-900">Шрифти</p>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Title</p>
                <p
                  style={{
                    fontFamily: vibe === 'bold' ? 'Manrope, sans-serif' : '"Cormorant Garamond", serif',
                    fontWeight: vibe === 'bold' ? 700 : 600,
                    fontStyle: vibe === 'bold' ? 'normal' : 'italic',
                    fontSize: '1.2rem',
                  }}
                >
                  {fonts.titleFont}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Body</p>
                <p style={{ fontFamily: 'Manrope, sans-serif' }}>Manrope Regular</p>
              </div>
            </div>
          </div>

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
