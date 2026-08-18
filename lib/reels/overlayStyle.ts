/**
 * How each kind of attachment looks, in one place.
 *
 * The same four things appear as an underline under a phrase, as a chip below
 * the line, as a row on «Що поверх» and as a button on the selection bar. They
 * have to be recognisably the same object in all four, so the colour and the
 * glyph are looked up here rather than chosen per surface.
 */

import { OVERLAY_LABELS, type OverlayKind } from './blocks';

export type OverlayStyle = {
  label: string;
  /** Carries the meaning on its own for anyone who can't separate the hues. */
  glyph: string;
  /** The underline and the chip's text. */
  color: string;
  /** The wash behind the phrase and behind the chip. */
  wash: string;
};

/**
 * Only four are offered. `note` exists in the model and in the operator
 * edition, so it is styled here to be RENDERABLE — a reel written there and
 * opened here must not show a blank chip — but it is not something the customer
 * app asks anyone to create.
 */
export const OFFERED_OVERLAY_KINDS: readonly OverlayKind[] = ['image', 'video', 'text', 'sound'];

export const OVERLAY_STYLES: Record<OverlayKind, OverlayStyle> = {
  image: { label: OVERLAY_LABELS.image, glyph: '📷', color: '#004BA8', wash: 'rgba(0,75,168,0.10)' },
  video: { label: OVERLAY_LABELS.video, glyph: '🎬', color: '#0F7A5E', wash: 'rgba(15,138,106,0.12)' },
  text: { label: OVERLAY_LABELS.text, glyph: '✍️', color: '#A8761A', wash: 'rgba(192,140,40,0.14)' },
  sound: { label: OVERLAY_LABELS.sound, glyph: '🔊', color: '#CE4E34', wash: 'rgba(224,100,74,0.12)' },
  note: { label: OVERLAY_LABELS.note, glyph: '📝', color: '#5A5C6B', wash: 'rgba(90,92,107,0.10)' },
};

export function overlayStyle(kind: OverlayKind): OverlayStyle {
  return OVERLAY_STYLES[kind] ?? OVERLAY_STYLES.note;
}

/**
 * What the chip says when nothing has been typed into it yet.
 *
 * An attachment with no description is still a real instruction — «щось сюди» —
 * so it shows its type rather than an empty chip that reads as a rendering bug.
 */
export function overlayChipText(kind: OverlayKind, note: string, url?: string | null): string {
  const described = note.trim();
  if (described) return described;
  if ((url ?? '').trim()) return overlayStyle(kind).label;
  return `${overlayStyle(kind).label} — додай опис`;
}
