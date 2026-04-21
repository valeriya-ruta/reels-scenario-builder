export type BgPhotoTransform = {
  offset_x: number;
  offset_y: number;
  scale: number;
};

export const DEFAULT_BG_PHOTO_TRANSFORM: BgPhotoTransform = {
  offset_x: 0,
  offset_y: 0,
  scale: 1,
};

export const MIN_BG_PHOTO_SCALE = 0.5;
export const MAX_BG_PHOTO_SCALE = 2.5;

export function sanitizeBgPhotoTransform(value: unknown): BgPhotoTransform | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const ox = typeof obj.offset_x === 'number' && Number.isFinite(obj.offset_x) ? obj.offset_x : 0;
  const oy = typeof obj.offset_y === 'number' && Number.isFinite(obj.offset_y) ? obj.offset_y : 0;
  const scale = typeof obj.scale === 'number' && Number.isFinite(obj.scale) ? obj.scale : 1;
  return {
    offset_x: ox,
    offset_y: oy,
    scale: clampPhotoScale(scale),
  };
}

export function getBgPhotoTransform(value: BgPhotoTransform | null | undefined): BgPhotoTransform {
  if (!value) return DEFAULT_BG_PHOTO_TRANSFORM;
  return {
    offset_x: Number.isFinite(value.offset_x) ? value.offset_x : 0,
    offset_y: Number.isFinite(value.offset_y) ? value.offset_y : 0,
    scale: clampPhotoScale(Number.isFinite(value.scale) ? value.scale : 1),
  };
}

export function clampPhotoScale(scale: number): number {
  return Math.min(MAX_BG_PHOTO_SCALE, Math.max(MIN_BG_PHOTO_SCALE, scale));
}

export function clampOffsetFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(-5, value));
}

export function normalizeBgPhotoTransform(value: BgPhotoTransform): BgPhotoTransform {
  return {
    offset_x: clampOffsetFraction(value.offset_x),
    offset_y: clampOffsetFraction(value.offset_y),
    scale: clampPhotoScale(value.scale),
  };
}

export function toCssTranslatePx(transform: BgPhotoTransform, frameWidth: number, frameHeight: number): {
  x: number;
  y: number;
} {
  return {
    x: transform.offset_x * frameWidth,
    y: transform.offset_y * frameHeight,
  };
}

export function zoomAroundPoint(
  transform: BgPhotoTransform,
  nextScale: number,
  pointXFromCenterPx: number,
  pointYFromCenterPx: number,
  frameWidth: number,
  frameHeight: number,
): BgPhotoTransform {
  const safe = getBgPhotoTransform(transform);
  const targetScale = clampPhotoScale(nextScale);
  if (Math.abs(targetScale - safe.scale) < 1e-6) return safe;

  const currentTx = safe.offset_x * frameWidth;
  const currentTy = safe.offset_y * frameHeight;

  const contentX = (pointXFromCenterPx - currentTx) / safe.scale;
  const contentY = (pointYFromCenterPx - currentTy) / safe.scale;

  const nextTx = pointXFromCenterPx - contentX * targetScale;
  const nextTy = pointYFromCenterPx - contentY * targetScale;

  return normalizeBgPhotoTransform({
    offset_x: nextTx / frameWidth,
    offset_y: nextTy / frameHeight,
    scale: targetScale,
  });
}
