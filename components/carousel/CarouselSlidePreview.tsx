'use client';

import { type CSSProperties, type ReactNode } from 'react';
import type { Slide } from '@/lib/carouselTypes';
import { resolveSlideKind } from '@/lib/carouselTypes';
import {
  CANVAS_SIZE,
  DEFAULT_DARK,
  DEFAULT_ACCENT,
  DEFAULT_BG,
  DOT_BOTTOM_Y,
} from '@/lib/carousel/carouselConstants';
import { parseAccentSpans, stripAccentMarkers } from '@/lib/carousel/accentSpans';
import type { BrandSettings } from '@/lib/brand';
import { normalizeHex } from '@/lib/brand';
import type { BrandAccentStyle } from '@/lib/brand';
import type { BrandFont } from '@/lib/brandFonts';
import { BODY_FALLBACK_FONT } from '@/lib/brandFonts';

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

function CheckboxIcon({ color }: { color: string }) {
  return (
    <svg className="shrink-0" viewBox="0 0 24 24" width={28} height={28} aria-hidden style={{ color }}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M7 12l3 3 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProgressDots({
  slideIndex,
  totalSlides,
  accentColor,
  lightOnDark,
}: {
  slideIndex: number;
  totalSlides: number;
  accentColor: string;
  lightOnDark: boolean;
}) {
  const inactive = lightOnDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.25)';
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 flex justify-center gap-2.5"
      style={{ bottom: DOT_BOTTOM_Y }}
    >
      {Array.from({ length: totalSlides }, (_, i) => (
        <span
          key={i}
          className="block h-3.5 w-3.5 rounded-full"
          style={{ backgroundColor: i === slideIndex - 1 ? accentColor : inactive }}
        />
      ))}
    </div>
  );
}

function ImageBackground({ slide, fallbackHex }: { slide: Slide; fallbackHex: string }) {
  const url = slide.backgroundImageBase64
    ? `data:image/png;base64,${slide.backgroundImageBase64}`
    : slide.backgroundImageUrl || '';
  return (
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={{ backgroundImage: url ? `url(${url})` : undefined, backgroundColor: fallbackHex }}
    />
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
  return (
    <div
      className="rounded-2xl px-6 py-5"
      style={{
        backgroundColor: t === 'backdrop' ? oc : 'rgba(20,20,20,0.35)',
        opacity: t === 'backdrop' ? op : 1,
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
}: {
  slide: Slide;
  brand: BrandSettings;
  brandFont: BrandFont;
  scale: number;
  slideIndex: number;
  totalSlides: number;
}) {
  const kind = slide.slideKind ?? resolveSlideKind(slide, slideIndex - 1, totalSlides);
  const refined = brand.vibe === 'refined';
  const accent = normalizeHex(brand.colors.accent1 || DEFAULT_ACCENT);
  const lightBg = normalizeHex(brand.colors.lightBg || DEFAULT_BG);
  const darkBg = normalizeHex(brand.colors.darkBg || DEFAULT_DARK);

  const textAlignClass =
    slide.textAlign === 'right' ? 'text-right' : slide.textAlign === 'center' ? 'text-center' : 'text-left';

  const placement = slide.placement;
  const justify =
    placement === 'top' ? 'flex-start' : placement === 'bottom' ? 'flex-end' : 'center';

  const baseWrap: CSSProperties = {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
  };

  const titleFont = `'${brandFont.label}', sans-serif`;
  const bodyFont = brandFont.bodyAvailable ? titleFont : `'${BODY_FALLBACK_FONT}', sans-serif`;

  const hasPhoto = slide.backgroundType === 'image' && (slide.backgroundImageUrl || slide.backgroundImageBase64);

  const contentShell = (bg: string, inner: ReactNode) => {
    if (!hasPhoto) {
      return (
        <div
          className="relative flex h-full w-full flex-col px-[88px] py-[72px]"
          style={{ justifyContent: justify, backgroundColor: bg }}
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
        <ImageBackground slide={slide} fallbackHex={bg} />
        <ImageOverlays slide={slide} darkFallback={darkBg} />
        <div
          className="relative flex h-full w-full flex-col px-[88px] py-[72px]"
          style={{ justifyContent: justify }}
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

  if (slide.generatedImageBase64) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-black shadow-lg" style={baseWrap}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${slide.generatedImageBase64}`}
          alt=""
          className="h-full w-full object-cover"
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
        />
      </div>
    );
  }

  if (kind === 'cover') {
    const bodyLine = stripAccentMarkers(slide.body).trim();
    const fallbackSub = (slide.label || slide.design_note || '').trim();
    const showCoverSubline = Boolean(bodyLine || fallbackSub);
    if (refined) {
      return (
        <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseWrap, backgroundColor: '#f5f2ed' }}>
          <div className="absolute left-[88px] top-[36px] text-[22px] tracking-wide text-zinc-400" style={{ fontFamily: bodyFont }}>
            {(slide.label || 'Карусель').toUpperCase()}
          </div>
          <div className="absolute bottom-[100px] left-[88px] right-[88px] top-[140px] flex flex-col justify-end">
            <div className={`${textAlignClass} text-[88px] font-bold leading-[1.0] text-zinc-900`} style={{ fontFamily: titleFont }}>
              <AccentRuns text={slide.title || 'Заголовок'} accentStyle={brand.accentStyle} accentColor={accent} />
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
          <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} accentColor={accent} lightOnDark={false} />
        </div>
      );
    }
    return (
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseWrap, backgroundColor: DEFAULT_DARK }}>
        {contentShell(
          DEFAULT_DARK,
          <>
            <div className="mb-5 h-1.5 w-12 rounded-sm" style={{ backgroundColor: accent }} />
            <div className="text-[88px] font-bold leading-[0.98] text-white" style={{ fontFamily: titleFont, fontWeight: brandFont.titleWeight }}>
              <AccentRuns text={slide.title || 'Заголовок'} accentStyle={brand.accentStyle} accentColor={accent} />
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
        <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} accentColor={accent} lightOnDark />
      </div>
    );
  }

  if (kind === 'statement') {
    return (
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseWrap, backgroundColor: accent }}>
        {contentShell(
          accent,
          <div className="flex w-full flex-col items-center justify-center py-8">
            <div className={`w-full ${textAlignClass} text-[72px] font-bold leading-tight text-white`} style={{ fontFamily: titleFont }}>
              <AccentRuns text={slide.title} accentStyle={brand.accentStyle} accentColor={lightBg} />
            </div>
            {slide.icon ? (
              <span className="mt-8 text-6xl" aria-hidden>
                {slide.icon}
              </span>
            ) : null}
          </div>,
        )}
        <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} accentColor={lightBg} lightOnDark />
      </div>
    );
  }

  if (kind === 'bullets') {
    const items = slide.items?.length ? slide.items : ['Пункт 1', 'Пункт 2', 'Пункт 3'];
    return (
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseWrap, backgroundColor: lightBg }}>
        {contentShell(
          lightBg,
          <>
            <p className="text-[56px] font-bold leading-tight" style={{ fontFamily: titleFont, color: slide.titleColor }}>
              <AccentRuns text={slide.title || 'Заголовок'} accentStyle={brand.accentStyle} accentColor={accent} />
            </p>
            <ul className="mt-10 space-y-6 text-left">
              {items.map((line, i) => (
                <li key={i} className="flex items-start gap-4">
                  <CheckboxIcon color={accent} />
                  <span className="text-[36px] leading-snug" style={{ fontFamily: bodyFont, color: slide.bodyColor }}>
                    {line}
                  </span>
                </li>
              ))}
            </ul>
          </>,
        )}
        <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} accentColor={accent} lightOnDark={false} />
      </div>
    );
  }

  if (kind === 'cta') {
    const bodyClean = stripAccentMarkers(slide.body);
    return (
      <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseWrap, backgroundColor: darkBg }}>
        {contentShell(
          darkBg,
          <>
            <p className="text-[22px] font-medium uppercase tracking-wide text-white/70" style={{ fontFamily: bodyFont }}>
              {(slide.label || 'Дія').toUpperCase()}
            </p>
            <p className="mt-6 text-[72px] font-bold leading-[1.05] text-white" style={{ fontFamily: titleFont }}>
              <AccentRuns text={slide.title || 'Заголовок'} accentStyle={brand.accentStyle} accentColor={accent} />
            </p>
            <div className="mt-10 rounded-2xl px-8 py-6" style={{ backgroundColor: accent }}>
              <p className="text-center text-[36px] font-bold text-white" style={{ fontFamily: titleFont }}>
                {bodyClean || 'Текст кнопки'}
              </p>
            </div>
          </>,
        )}
        <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} accentColor={accent} lightOnDark />
      </div>
    );
  }

  const pill = (slide.label || `Крок ${String(slideIndex).padStart(2, '0')}`).trim();
  return (
    <div className="relative overflow-hidden rounded-xl shadow-lg" style={{ ...baseWrap, backgroundColor: lightBg }}>
      {contentShell(
        lightBg,
        <>
          <span
            className="inline-block rounded-full px-5 py-2 text-[22px] font-semibold text-white"
            style={{ backgroundColor: accent, fontFamily: bodyFont }}
          >
            {pill}
          </span>
          <p className="mt-8 text-[64px] font-bold leading-[1.05]" style={{ fontFamily: titleFont, color: slide.titleColor }}>
            <AccentRuns text={slide.title || 'Заголовок'} accentStyle={brand.accentStyle} accentColor={accent} />
          </p>
          <p className="mt-6 text-[34px] leading-relaxed text-zinc-700" style={{ fontFamily: bodyFont, color: slide.bodyColor }}>
            {stripAccentMarkers(slide.body) || 'Текст'}
          </p>
        </>,
      )}
      <ProgressDots slideIndex={slideIndex} totalSlides={totalSlides} accentColor={accent} lightOnDark={false} />
    </div>
  );
}
