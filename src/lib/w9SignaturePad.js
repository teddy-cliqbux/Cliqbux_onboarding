/**
 * W-9 draw-signature pad helpers (/uw/:token).
 * Legacy pad was 560×120 with mouseleave ending strokes — too small/fragile.
 */

/** Minimum on-screen pad height (CSS px). Legacy was 120. */
export const W9_PAD_CSS_HEIGHT = 220;

/** Reference bitmap width for signature PNG export. */
export const W9_PAD_BITMAP_WIDTH = 560;

/**
 * Map a pointer/touch event into canvas bitmap coordinates.
 * @param {{ clientX?: number, clientY?: number, touches?: TouchList }} evt
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @param {{ width: number, height: number }} canvas
 */
export function mapPointerToCanvas(evt, rect, canvas) {
  const clientX = evt.touches?.[0]?.clientX ?? evt.clientX;
  const clientY = evt.touches?.[0]?.clientY ?? evt.clientY;
  const w = Number(rect.width) || 1;
  const h = Number(rect.height) || 1;
  return {
    x: ((clientX - rect.left) / w) * canvas.width,
    y: ((clientY - rect.top) / h) * canvas.height,
  };
}

/**
 * Bitmap size for a CSS box at the given devicePixelRatio.
 * @returns {{ width: number, height: number, dpr: number }}
 */
export function bitmapSizeForPad(cssWidth, cssHeight = W9_PAD_CSS_HEIGHT, dpr = 1) {
  const ratio = Math.max(1, Number(dpr) || 1);
  const w = Math.max(1, Math.round(Number(cssWidth) || W9_PAD_BITMAP_WIDTH));
  const h = Math.max(1, Math.round(Number(cssHeight) || W9_PAD_CSS_HEIGHT));
  return {
    width: Math.round(w * ratio),
    height: Math.round(h * ratio),
    dpr: ratio,
  };
}