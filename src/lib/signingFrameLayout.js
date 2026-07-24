/**
 * Mobile BoldSign / MSP signing frame layout helpers.
 *
 * Trisha Mobile Test (2026-07-24): nested `overflow: hidden` on `.portal-card`
 * plus a fixed 680px iframe trapped touch scroll/taps on phone. Prefer
 * overflow-x clip only, viewport-aware iframe height, and an Open-in-new-tab
 * escape hatch on narrow screens.
 */

/** Tailwind / CSS classes for the portal shell while a signing iframe is shown. */
export const PORTAL_CARD_SIGNING_OVERFLOW = 'overflow-x-hidden';

/** Iframe height style — fills usable viewport on phones, caps on desktop. */
export const SIGNING_IFRAME_HEIGHT_STYLE = {
  height: 'min(680px, calc(100dvh - 11rem))',
  minHeight: 420,
  border: 'none',
  display: 'block',
};

/**
 * @param {number} viewportWidth
 * @returns {boolean}
 */
export function shouldPreferOpenSigningTab(viewportWidth) {
  return Number(viewportWidth) > 0 && Number(viewportWidth) < 768;
}

/**
 * Contract checks used by the Playwright mobile fixture + unit tests.
 * @param {{ cardOverflowY: string, wrapOverflow: string, openVisible: boolean, viewportWidth: number }} metrics
 */
export function assertSigningMobileShellContract(metrics) {
  const errors = [];
  const oy = String(metrics.cardOverflowY || '').toLowerCase();
  if (oy === 'hidden' || oy === 'clip') {
    errors.push(`portal-card overflow-y must not trap iframe touch scroll (got ${oy})`);
  }
  const wrap = String(metrics.wrapOverflow || '').toLowerCase();
  if (wrap === 'hidden' || wrap === 'clip') {
    errors.push(`signing frame wrap overflow must not be hidden/clip (got ${wrap})`);
  }
  if (shouldPreferOpenSigningTab(metrics.viewportWidth) && !metrics.openVisible) {
    errors.push('mobile viewport requires visible Open signing form link');
  }
  return errors;
}
