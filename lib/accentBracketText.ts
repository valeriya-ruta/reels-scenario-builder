/**
 * Toggle `{…}` wrappers for carousel accent text. Pillow reads the same syntax.
 */
export function applyAccentToggle(
  value: string,
  start: number,
  end: number,
): { value: string; selStart: number; selEnd: number } | null {
  if (start === end) return null;
  const sel = value.slice(start, end);

  // Selection is wrapped by adjacent `{` … `}`
  if (start > 0 && value[start - 1] === '{' && value[end] === '}') {
    const newValue = value.slice(0, start - 1) + sel + value.slice(end + 1);
    return { value: newValue, selStart: start - 1, selEnd: end - 1 };
  }

  // Whole selection is `{…}` — unwrap to inner
  if (sel.length >= 2 && sel[0] === '{' && sel[sel.length - 1] === '}') {
    const inner = sel.slice(1, -1);
    const newValue = value.slice(0, start) + inner + value.slice(end);
    return { value: newValue, selStart: start, selEnd: start + inner.length };
  }

  const newValue = value.slice(0, start) + '{' + sel + '}' + value.slice(end);
  return { value: newValue, selStart: start, selEnd: end + 2 };
}

export type AccentSegment = { kind: 'plain' | 'accent'; text: string };

/** Split display text into plain / accent runs using first `{`…`}` pair at each step. */
export function parseAccentSegments(text: string): AccentSegment[] {
  const out: AccentSegment[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open === -1) {
      out.push({ kind: 'plain', text: text.slice(i) });
      break;
    }
    if (open > i) {
      out.push({ kind: 'plain', text: text.slice(i, open) });
    }
    const close = text.indexOf('}', open + 1);
    if (close === -1) {
      out.push({ kind: 'plain', text: text.slice(open) });
      break;
    }
    out.push({ kind: 'accent', text: text.slice(open + 1, close) });
    i = close + 1;
  }
  if (out.length === 0) {
    out.push({ kind: 'plain', text: '' });
  }
  return out;
}

export function hasAccentBraces(text: string): boolean {
  return text.includes('{') && text.includes('}');
}
