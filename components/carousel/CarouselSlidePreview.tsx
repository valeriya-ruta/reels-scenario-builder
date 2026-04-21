'use client';

import { type CSSProperties, type ReactNode } from 'react';
import type { Slide } from '@/lib/carouselTypes';
import { resolveSlideType } from '@/lib/carouselTypes';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DEFAULT_DARK,
  DEFAULT_ACCENT,
  DEFAULT_BG,
} from '@/lib/carousel/carouselConstants';
import { parseAccentSpans, stripAccentMarkers } from '@/lib/carousel/accentSpans';
import type { BrandSettings } from '@/lib/brand';
import { normalizeHex } from '@/lib/brand';
import type { BrandAccentStyle } from '@/lib/brand';
import type { BrandFont } from '@/lib/brandFonts';
import { BODY_FALLBACK_FONT } from '@/lib/brandFonts';
import {
  getBgPhotoTransform,
  toCssTranslatePx,
  type BgPhotoTransform,
} from '@/lib/carousel/bgPhotoTransform';

function AccentRuns({
  text,
  accentStyle,
  accentColor,
  className,
  style,
}: {
  text: string;
  accentStyle: BrandAccentStyle;
  accentColor: string;
  className?: string;
  style?: CSSProperties;
}) {
  const hex = normalizeHex(accentColor);
  const segs = parseAccentSpans(text);
  return (
    <span className={className} style={style}>
      {segs.map((s, i) =>
        s.isAccent ? (
          <AccentInline key={i} kind={accentStyle} color={hex}>
            {s.text}
          </AccentInline>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </span>
  );
}

function AccentInline({
  children,
  kind,
  color,
}: {
  children: ReactNode;
  kind: BrandAccentStyle;
  color: string;
}) {
  const base = 'inline';
  switch (kind) {
    case 'italic':
      return (
        <span className={`${base} italic font-semibold`} style={{ color }}>
          {children}
        </span>
      );
    case 'pill':
      return (
        <span
          className={`${base} rounded-full px-2 py-0.5 text-[0.92em] font-semibold text-white`}
          style={{ backgroundColor: color }}
        >
          {children}
        </span>
      );
    case 'rectangle':
      return (
        <span className={`${base} border-2 px-1 py-px text-[0.92em] font-semibold`} style={{ borderColor: color, color }}>
          {children}
        </span>
      );
    case 'marker':
      return (
        <span className={`${base} px-0.5 text-[0.92em] font-semibold`} style={{ color, backgroundColor: `${color}44` }}>
          {children}
        </span>
      );
    case 'bold':
    default:
      return (
        <span className={`${base} font-bold`} style={{ color }}>
          {children}
        </span>
      );
  }
}

function markerFor(style: Slide['bulletStyle'], i: number): string {
  switch (style) {
    case 'numbered-simple':
      return `${i + 1} ·`;
    case 'dots':
      return '●';
    case 'dashes':
      return '—';
    case 'checks':
      return '✓';
    case 'cross-check':
      return i === 0 ? '✗' : '✓';
    case 'numbered-padded':
    default:
      return `${String(i + 1).padStart(2, '0')}.`;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHex(hex).replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function coverGradient(brand: BrandSettings, slide: Slide): string {
  const light = normalizeHex(slide.backgroundColor || brand.colors.lightBg || '#f5f2ed');
  const mid = normalizeHex(slide.gradientMidColor || brand.colors.accent1 || '#d6b58a');
  const dark = normalizeHex(slide.gradientEndColor || brand.colors.darkBg || '#1a1a2e');
  return brand.vibe === 'refined'
    ? `radial-gradient(ellipse at 40% 30%, ${light} 0%, ${mid} 60%, ${dark} 100%)`
    : `radial-gradient(circle at 30% 30%, ${light} 0%, ${mid} 60%, ${dark} 100%)`;
}

function luminance(hex: string): number {
  const normalized = normalizeHex(hex).replace('#', '');
  const toLinear = (channelHex: string) => {
    const value = Number.parseInt(channelHex, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = toLinear(normalized.slice(0, 2));
  const g = toLinear(normalized.slice(2, 4));
  const b = toLinear(normalized.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const fg = luminance(foreground);
  const bg = luminance(background);
  const [lighter, darker] = fg > bg ? [fg, bg] : [bg, fg];
  return (lighter + 0.05) / (darker + 0.05);
}

function ensureReadableTextColor(preferred: string, background: string): string {
  const safePreferred = normalizeHex(preferred);
  const safeBackground = normalizeHex(background);
  if (contrastRatio(safePreferred, safeBackground) >= 4.5) return safePreferred;
  const nearWhite = '#FFF9F0';
  return contrastRatio(nearWhite, safeBackground) >= 4.5 ? nearWhite : '#FFFFFF';
}

function ImageBackground({
  slide,
  fallbackHex,
  transformOverride,
  isInteractingPhoto,
  showPositionOutline,
}: {
  slide: Slide;
  fallbackHex: string;
  transformOverride?: BgPhotoTransform | null;
  isInteractingPhoto?: boolean;
  showPositionOutline?: boolean;
}) {
  const gradient = `radial-gradient(circle at 30% 30%, ${slide.backgroundColor || fallbackHex} 0%, ${slide.gradientMidColor || slide.overlayColor || fallbackHex} 60%, ${slide.gradientEndColor || '#111111'} 100%)`;
  const url = slide.backgroundImageBase64
    ? `data:image/png;base64,${slide.backgroundImageBase64}`
    : slide.backgroundImageUrl || '';
  const transform = getBgPhotoTransform(transformOverride ?? slide.bgPhotoTransform);
  const translate = toCssTranslatePx(transform, CANVAS_WIDTH, CANVAS_HEIGHT);
  return (
    <div className="absolute inset-0" style={{ backgroundColor: fallbackHex }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${transform.scale})`,
            transformOrigin: 'center center',
            willChange: isInteractingPhoto ? 'transform' : undefined,
            outline: showPositionOutline ? '2px solid rgba(255,255,255,0.6)' : undefined,
            outlineOffset: showPositionOutline ? '-4px' : undefined,
          }}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ backgroundImage: slide.backgroundType === 'gradient' ? gradient : undefined }}
        />
      )}
    </div>
  );
}

function ImageOverlays({ slide, darkFallback }: { slide: Slide; darkFallback: string }) {
  const oc = normalizeHex(slide.overlayColor || darkFallback);
  const op = (slide.overlayOpacity ?? 50) / 100;
  const t = slide.overlayType;
  if (t === 'full') {
    return <div className="absolute inset-0" style={{ backgroundColor: oc, opacity: op }} />;
  }
  if (t === 'gradient') {
    return (
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, ${oc} 0%, transparent 60%)`,
          opacity: op,
        }}
      />
    );
  }
  return null;
}

/** Backdrop / frost panel behind text block only */
function TextPanelChrome({
  slide,
  darkFallback,
  children,
}: {
  slide: Slide;
  darkFallback: string;
  children: ReactNode;
}) {
  const hasPhoto = slide.backgroundType === 'image' && (slide.backgroundImageUrl || slide.backgroundImageBase64);
  const t = slide.overlayType;
  if (!hasPhoto || (t !== 'backdrop' && t !== 'frost')) return <>{children}</>;
  const oc = normalizeHex(slide.overlayColor || darkFallback);
  const op = (slide.overlayOpacity ?? 50) / 100;
  const panelBg = t === 'backdrop' ? hexToRgba(oc, op) : hexToRgba(oc, Math.max(0.18, op * 0.45));
  return (
    <div
      className="rounded-2xl px-6 py-5"
      style={{
        backgroundColor: panelBg,
        backdropFilter: t === 'frost' ? 'blur(12px)' : undefined,
      }}
    >
      {children}
    </div>
  );
}

export default function CarouselSlidePreview({
  slide,
  brand,
  brandFont,
  scale,
  slideIndex,
  totalSlides,
  photoTransformOverride,
  isInteractingPhoto = false,
  mobilePositioningMode = false,
}: {
  slide: Slide;
  brand: BrandSettings;
  brandFont: BrandFont;
  scale: number;
  slideIndex: number;
  totalSlides: number;
  photoTransformOverride?: BgPhotoTransform | null;
  isInteractingPhoto?: boolean;
  mobilePositioningMode?: boolean;
}) {
  const slideType = resolveSlideType(slide, slideIndex - 1, totalSlides);
  const refined = brand.vibe === 'refined';
  const accent = normalizeHex(brand.colors.accent1 || DEFAULT_ACCENT);
  const lightBg = normalizeHex(brand.colors.lightBg || DEFAULT_BG);
  const darkBg = normalizeHex(brand.colors.darkBg || DEFAULT_DARK);

  const forceCenteredCover = slideType === 'cover';
  const textAlignClass = forceCenteredCover
    ? 'text-center'
    : slide.textAlign === 'right'
      ? 'text-right'
      : slide.textAlign === 'center'
        ? 'text-center'
        : 'text-left';

  const placement = slide.placement;
  const justify =
    placement === 'top' ? 'flex-start' : placement === 'bottom' ? 'flex-end' : 'center';

  const baseWrap: CSSProperties = {
    width: Math.round(CANVAS_WIDTH * scale),
    height: Math.round(CANVAS_HEIGHT * scale),
    overflow: 'hidden',
  };

  const baseCanvas: CSSProperties = {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  };

  const titleFont = `'${brandFont.label}', sans-serif`;
  const bodyFont = brandFont.bodyAvailable ? titleFont : `'${BODY_FALLBACK_FONT}', sans-serif`;

  const hasPhoto = slide.backgroundType === 'image' && (slide.backgroundImageUrl || slide.backgroundImageBase64);

  const contentShell = (bg: string, inner: ReactNode) => {
    if (!hasPhoto) {
      const backgroundStyle =
        slide.backgroundType === 'gradient'
          ? { backgroundImage: coverGradient(brand, slide) }
          : { backgroundColor: slide.backgroundColor || bg };
      return (
        <div
          className="relative flex h-full w-full flex-col px-[88px] py-[72px]"
          style={{ justifyContent: justify, ...backgroundStyle }}
        >
          <div className={`w-full ${textAlignClass}`}>
            <TextPanelChrome slide={slide} darkFallback={darkBg}>
              {inner}
            </TextPanelChrome>
          </div>
        </div>
      );
    }
    return (
      <div className="relative h-full w-full">
        <ImageBackground
          slide={slide}
          fallbackHex={bg}
          transformOverride={photoTransformOverride}
          isInteractingPhoto={isInteractingPhoto}
          showPositionOutline={mobilePositioningMode}
        />
        <ImageOverlays slide={slide} darkFallback={darkBg} />
        <div
          className="relative flex h-full w-full flex-col px-[88px] py-[72px]"
          style={{
            justifyContent: justify,
            opacity: mobilePositioningMode ? 0.4 : 1,
            pointerEvents: mobilePositioningMode ? 'none' : undefined,
          }}
        >
          <div className={`w-full ${textAlignClass}`}>
            <TextPanelChrome slide={slide} darkFallback={darkBg}>
              {inner}
            </TextPanelChrome>
          </div>
        </div>
      </div>
    );
  };

  if (slideType === 'cover') {
    const bodyLine = stripAccentMarkers(slide.body).trim();
    const fallbackSub = (slide.label || slide.design_note || '').trim();
    const showCoverSubline = Boolean(bodyLine || fallbackSub);
    if (refined) {
      return (
        <div className="relative overflow-hidden rounded-xl shadow-lg" style={baseWrap}>
        <div
          className="relative overflow-hidden rounded-xl shadow-lg"
          style={{
            ...baseCanvas,
            backgroundColor: lightBg,
            backgroundImage: slide.backgroundType === 'gradient' ? coverGradient(brand, slide) : undefined,
          }}
        >
            <div className="absolute bottom-[100px] left-[88px] right-[88px] top-[140px] flex flex-col justify-end">
              <div className={`${textAlignClass} text-[88px] font-bold leading-[1.0] text-zinc-900 whitespace-pre-wrap`} style={{ fontFamily: titleFont, fontSize: (slide.titleSize ?? 'L') === 'M' ? 70 : 88 }}>
                <AccentRuns text={slide.title} accentStyle={brand.accentStyle} accentColor={accent} />
              </div>
              {showCoverSubline ? (
                <p className="mt-6 text-[28px] leading-snug text-zinc-500" style={{ fontFamily: bodyFont }}>
                  {bodyLine ? (
                    <AccentRuns text={slide.body} accentStyle={brand.accentStyle} accentColor={accent} />
                  ) : (
                    fallbackSub
                  )}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={baseWrap}>
        <div
          className="relative overflow-hidden rounded-xl shadow-lg"
          style={{
            ...baseCanvas,
            backgroundColor: slide.backgroundType === 'color' ? (slide.backgroundColor || DEFAULT_DARK) : DEFAULT_DARK,
            backgroundImage: slide.backgroundType === 'gradient' ? coverGradient(brand, slide) : undefined,
          }}
        >
          {contentShell(
            DEFAULT_DARK,
            <>
              <div className="mb-5 h-1.5 w-12 rounded-sm" style={{ backgroundColor: accent }} />
              <div className="text-[88px] font-bold leading-[0.98] text-white whitespace-pre-wrap" style={{ fontFamily: titleFont, fontWeight: brandFont.titleWeight, fontSize: (slide.titleSize ?? 'L') === 'M' ? 70 : 88 }}>
                <AccentRuns text={slide.title} accentStyle={brand.accentStyle} accentColor={accent} />
              </div>
              {showCoverSubline ? (
                <p className="mt-3 text-[26px] text-white/80" style={{ fontFamily: bodyFont }}>
                  {bodyLine ? (
                    <AccentRuns text={slide.body} accentStyle={brand.accentStyle} accentColor={accent} />
                  ) : (
                    fallbackSub
                  )}
                </p>
              ) : null}
            </>,
          )}
        </div>
      </div>
    );
  }

  if (slide.layoutPreset === 'quote' || slide.layoutPreset === 'testimonial') {
    const quoteText = slide.title?.trim() || slide.body?.trim() || '';
    const quoteBg = slide.backgroundType === 'color' ? normalizeHex(slide.backgroundColor || accent) : accent;
    const quoteColor = ensureReadableTextColor(slide.titleColor || '#FFFFFF', quoteBg);
    const quoteSize = slide.layoutPreset === 'quote'
      ? (slide.titleSize ?? 'L') === 'M' ? 70 : 82
      : (slide.titleSize ?? 'L') === 'M' ? 46 : 52;
    return (
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={baseWrap}>
        <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseCanvas, backgroundColor: quoteBg }}>
          {contentShell(
            quoteBg,
            <div className="flex w-full flex-col items-center justify-center py-8">
              <div className={`w-full ${textAlignClass} font-bold leading-tight whitespace-pre-wrap`} style={{ fontFamily: titleFont, color: quoteColor, fontSize: quoteSize }}>
                <AccentRuns text={quoteText} accentStyle={brand.accentStyle} accentColor={lightBg} />
              </div>
              {slide.layoutPreset === 'testimonial' ? (
                <div className="mt-3 flex items-center gap-2" style={{ color: quoteColor }}>
                  <div className="h-8 w-8 rounded-full bg-white/20" />
                  <div className="text-left text-sm">
                    <p>{slide.testimonialAuthor?.name || 'Автор'}</p>
                    <p style={{ opacity: 0.72 }}>{slide.testimonialAuthor?.handle || '@handle'}</p>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (slide.layoutPreset === 'list') {
    const items = slide.listItems?.length ? slide.listItems : ['Пункт 1', 'Пункт 2', 'Пункт 3'];
    return (
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={baseWrap}>
        <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseCanvas, backgroundColor: lightBg }}>
          {contentShell(
            lightBg,
            <>
              <p className="text-[56px] font-bold leading-tight whitespace-pre-wrap" style={{ fontFamily: titleFont, color: slide.titleColor, fontSize: (slide.titleSize ?? 'L') === 'M' ? 45 : 56 }}>
                <AccentRuns text={slide.title} accentStyle={brand.accentStyle} accentColor={accent} />
              </p>
              <ul className={`mt-10 text-left ${refined ? 'space-y-5' : 'space-y-3'}`}>
                {items.map((line, i) => (
                  <li key={i} className={`flex items-start gap-4 ${refined && i > 0 ? 'border-t border-black/10 pt-4' : ''}`}>
                    <span
                      className="mt-1 inline-block min-w-[48px] text-[28px] font-semibold"
                      style={{ color: slide.bulletStyle === 'cross-check' && i === 0 ? '#DC2626' : accent }}
                    >
                      {markerFor(slide.bulletStyle ?? 'numbered-padded', i)}
                    </span>
                    <span className="text-[36px] leading-snug whitespace-pre-wrap" style={{ fontFamily: bodyFont, color: slide.bodyColor, fontSize: (slide.bodySize ?? 'M') === 'S' ? 29 : 36 }}>
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
            </>,
          )}
        </div>
      </div>
    );
  }

  if (slideType === 'final') {
    const bodyClean = stripAccentMarkers(slide.body);
    return (
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={baseWrap}>
        <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseCanvas, backgroundColor: darkBg }}>
          {contentShell(
            darkBg,
            <>
              {slide.layoutPreset === 'reaction' ? (
                <>
                  <p className="text-[28px] text-white/85 whitespace-pre-wrap" style={{ fontFamily: bodyFont }}>{slide.ctaTitle || slide.title || 'Напиши в коментарі'}</p>
                  <p className="mt-8 text-center text-[120px] leading-none text-white" style={{ fontFamily: refined ? "'Cormorant Garamond', serif" : titleFont }}>{slide.ctaKeyword || 'РУТА'}</p>
                  <div className="mt-8 flex items-center justify-center gap-8 text-white">
                    {['save', 'share', 'like'].map((name) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={name} src={`/reaction-icons/${name}.svg`} alt={name} className="h-10 w-10" />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-6 text-[72px] font-bold leading-[1.05] text-white whitespace-pre-wrap" style={{ fontFamily: titleFont, fontSize: (slide.titleSize ?? 'L') === 'M' ? 58 : 72 }}>
                    <AccentRuns text={slide.title} accentStyle={brand.accentStyle} accentColor={accent} />
                  </p>
                  <div className="mt-10 rounded-2xl px-8 py-6" style={{ backgroundColor: accent }}>
                    <p className="text-center text-[36px] font-bold text-white" style={{ fontFamily: titleFont }}>
                      {bodyClean || 'Підпишись'}
                    </p>
                  </div>
                </>
              )}
            </>,
          )}
        </div>
      </div>
    );
  }

  const pill = (slide.optionalLabel || '').trim();
  return (
    <div className="relative overflow-hidden rounded-xl shadow-lg" style={baseWrap}>
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseCanvas, backgroundColor: lightBg }}>
        {contentShell(
          lightBg,
          <>
            {pill ? (
              <span
                className="inline-block rounded-full px-5 py-2 text-[22px] font-semibold text-white"
                style={{ backgroundColor: accent, fontFamily: bodyFont }}
              >
                {pill}
              </span>
            ) : null}
            <p className="mt-8 text-[64px] font-bold leading-[1.05] whitespace-pre-wrap" style={{ fontFamily: titleFont, color: slide.titleColor, fontSize: (slide.titleSize ?? 'L') === 'M' ? 52 : 64 }}>
              <AccentRuns text={slide.title} accentStyle={brand.accentStyle} accentColor={accent} />
            </p>
            <p className="mt-6 text-[34px] leading-relaxed text-zinc-700 whitespace-pre-wrap" style={{ fontFamily: bodyFont, color: slide.bodyColor, fontSize: (slide.bodySize ?? 'M') === 'S' ? 27 : 34 }}>
              {stripAccentMarkers(slide.body)}
            </p>
          </>,
        )}
      </div>
    </div>
  );
}
