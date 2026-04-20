export type AccentSegment = { text: string; isAccent: boolean };

/** Splits on `{` and `}` — inner text is accent-eligible (bold mode). */
export function parseAccentSpans(input: string): AccentSegment[] {
  const segments: AccentSegment[] = [];
  let buf = '';
  let inAccent = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '{') {
      if (buf) segments.push({ text: buf, isAccent: inAccent });
      buf = '';
      inAccent = true;
    } else if (c === '}') {
      if (buf) segments.push({ text: buf, isAccent: true });
      buf = '';
      inAccent = false;
    } else {
      buf += c;
    }
  }
  if (buf) segments.push({ text: buf, isAccent: inAccent });
  return segments;
}

/** Display text without braces (for measurement parity). */
export function stripAccentMarkers(input: string): string {
  return input.replace(/[{}]/g, '');
}
