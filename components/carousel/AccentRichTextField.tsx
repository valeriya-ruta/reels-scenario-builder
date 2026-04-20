'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Slide } from '@/lib/carouselTypes';
import type { BrandAccentStyle } from '@/lib/brand';
import { applyAccentToggle } from '@/lib/accentBracketText';
import AccentPreviewLine from '@/components/carousel/AccentPreviewLine';
import TextToolbar from '@/components/carousel/TextToolbar';

type AccentField = 'title' | 'body';

function autoGrowTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0px';
  el.style.height = `${el.scrollHeight}px`;
}

export default function AccentRichTextField({
  slideId,
  field,
  value,
  onPatch,
  multiline,
  baseColor,
  accentStyle,
  accentColor,
  inputClassName,
  rows = 4,
  toolbarPlacement = 'top',
  autoGrow = false,
  showPreviewLine = true,
}: {
  slideId: string;
  field: AccentField;
  value: string;
  onPatch: (id: string, patch: Partial<Pick<Slide, 'title' | 'body'>>) => void;
  multiline: boolean;
  baseColor: string;
  accentStyle: BrandAccentStyle;
  accentColor: string;
  inputClassName: string;
  rows?: number;
  /** `corner` = accent button top-right inside the field (mobile sheet). */
  toolbarPlacement?: 'top' | 'corner';
  autoGrow?: boolean;
  showPreviewLine?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [sel, setSel] = useState({ start: 0, end: 0 });

  useEffect(() => {
    if (multiline && autoGrow) {
      autoGrowTextarea(textareaRef.current);
    }
  }, [value, multiline, autoGrow]);

  const syncSel = () => {
    const el = multiline ? textareaRef.current : inputRef.current;
    if (!el) return;
    setSel({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });
  };

  const canApply = sel.start !== sel.end;

  const apply = useCallback(() => {
    const el = multiline ? textareaRef.current : inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const result = applyAccentToggle(value, start, end);
    if (!result) return;
    const patch = field === 'title' ? { title: result.value } : { body: result.value };
    flushSync(() => {
      onPatch(slideId, patch);
    });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selStart, result.selEnd);
      setSel({ start: result.selStart, end: result.selEnd });
    });
  }, [field, multiline, onPatch, slideId, value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      apply();
    }
  };

  const sharedProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onPatch(slideId, field === 'title' ? { title: e.target.value } : { body: e.target.value });
      if (multiline && autoGrow && textareaRef.current) {
        requestAnimationFrame(() => autoGrowTextarea(textareaRef.current));
      }
    },
    onSelect: syncSel,
    onKeyUp: syncSel,
    onMouseUp: syncSel,
    onKeyDown,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    className: inputClassName,
  };

  const toolbar = (
    <TextToolbar
      canApply={canApply}
      onAccent={apply}
      accentStyle={accentStyle}
      accentColor={accentColor}
    />
  );

  const preview = showPreviewLine ? (
    <AccentPreviewLine
      value={value}
      baseColor={baseColor}
      accentStyle={accentStyle}
      accentColor={accentColor}
    />
  ) : null;

  if (toolbarPlacement === 'corner') {
    return (
      <div className="relative">
        <div className="absolute right-2 top-2 z-10 [&>div]:mb-0">{toolbar}</div>
        {multiline ? (
          <textarea
            {...sharedProps}
            ref={textareaRef}
            rows={rows}
            style={autoGrow ? { overflow: 'hidden', minHeight: '3rem' } : undefined}
          />
        ) : (
          <input {...sharedProps} ref={inputRef} />
        )}
        {preview}
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      {multiline ? (
        <textarea {...sharedProps} ref={textareaRef} rows={rows} />
      ) : (
        <input {...sharedProps} ref={inputRef} />
      )}
      {preview}
    </div>
  );
}
