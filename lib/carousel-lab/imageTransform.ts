// Image pan/zoom math — forked from the main app's bgPhotoTransform so the lab's
// reposition/resize behaves identically (offset as a fraction of the slot, scale
// 1–2.5, offset clamped to (scale-1)/2 so the image always covers the slot).

export type ImgT = { tx: number; ty: number; scale: number };
export const DEFAULT_T: ImgT = { tx: 0, ty: 0, scale: 1 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 2.5;

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number.isFinite(s) ? s : 1));
export const maxOffset = (s: number) => Math.max(0, (clampScale(s) - 1) / 2);
export const clampOffset = (v: number, s: number) => {
  const m = maxOffset(s);
  return Math.min(m, Math.max(-m, Number.isFinite(v) ? v : 0));
};

export function normalizeT(t: ImgT): ImgT {
  const scale = clampScale(t.scale);
  return { tx: clampOffset(t.tx, scale), ty: clampOffset(t.ty, scale), scale };
}

export function getT(t: ImgT | null | undefined): ImgT {
  if (!t) return DEFAULT_T;
  return normalizeT({ tx: t.tx ?? 0, ty: t.ty ?? 0, scale: t.scale ?? 1 });
}

/** Zoom to `nextScale` keeping the point (px,py from slot center) fixed. */
export function zoomAroundPoint(t: ImgT, nextScale: number, px: number, py: number, fw: number, fh: number): ImgT {
  const safe = getT(t);
  const target = clampScale(nextScale);
  if (Math.abs(target - safe.scale) < 1e-6) return safe;
  const curTx = safe.tx * fw;
  const curTy = safe.ty * fh;
  const contentX = (px - curTx) / safe.scale;
  const contentY = (py - curTy) / safe.scale;
  const nextTx = px - contentX * target;
  const nextTy = py - contentY * target;
  return normalizeT({ tx: nextTx / fw, ty: nextTy / fh, scale: target });
}
