/**
 * In-page feedback screenshot with SSN-only DOM masking before html2canvas-pro.
 * html2canvas-pro supports modern CSS color() / oklch / color-mix (stock html2canvas throws).
 * See docs/superpowers/specs/2026-07-29-feedback-fix-loop-design.md
 */

const SSN_MASK = '•••-••-••••';
const MAX_WIDTH = 1280;
const JPEG_QUALITY = 0.7;

const SSN_NAME_RE = /^(ssn|social|socialsecurity|social_security|social-security)$/i;
const SSN_ID_RE = /ssn|social.?security/i;

/** True if this element should have its visible value masked (SSN only). */
export function isSsnMaskTarget(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.getAttribute?.('data-private') === 'ssn') return true;
  const name = el.getAttribute?.('name') || '';
  const id = el.getAttribute?.('id') || '';
  const auto = el.getAttribute?.('autocomplete') || '';
  if (SSN_NAME_RE.test(name) || SSN_ID_RE.test(id)) return true;
  if (/social.?security/i.test(auto) || auto === 'on' && SSN_NAME_RE.test(name)) return true;
  return false;
}

function collectSsnTargets(root = document) {
  const set = new Set();
  root.querySelectorAll('[data-private="ssn"]').forEach((el) => set.add(el));
  root.querySelectorAll('input, textarea').forEach((el) => {
    if (isSsnMaskTarget(el)) set.add(el);
  });
  return [...set];
}

/**
 * Temporarily replace SSN field values / text with a mask. Returns restore().
 */
export function applySsnMasks(root = document) {
  const backups = [];
  for (const el of collectSsnTargets(root)) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      backups.push({
        el,
        kind: 'value',
        value: el.value,
        type: el.type,
      });
      try {
        el.type = 'text';
      } catch { /* some input types can't change */ }
      el.value = SSN_MASK;
    } else {
      backups.push({
        el,
        kind: 'text',
        text: el.textContent,
      });
      el.textContent = SSN_MASK;
    }
  }
  return () => {
    for (const b of backups) {
      if (b.kind === 'value') {
        b.el.value = b.value;
        try {
          if (b.type) b.el.type = b.type;
        } catch { /* ignore */ }
      } else {
        b.el.textContent = b.text;
      }
    }
  };
}

function hideFeedbackWidgets() {
  const nodes = [...document.querySelectorAll('[data-feedback-widget]')];
  const prev = nodes.map((el) => ({ el, visibility: el.style.visibility }));
  for (const el of nodes) el.style.visibility = 'hidden';
  return () => {
    for (const p of prev) p.el.style.visibility = p.visibility;
  };
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Screenshot encoding failed'))),
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}

/**
 * Capture the current page (document.body) as a JPEG blob + data URL.
 * Masks SSN fields and hides the feedback widget during capture.
 */
export async function captureFeedbackScreenshot() {
  const html2canvas = (await import('html2canvas-pro')).default;
  const restoreMask = applySsnMasks(document);
  const restoreWidget = hideFeedbackWidgets();
  try {
    // Let the browser paint masked values before rasterizing
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      logging: false,
      scale: Math.min(1, MAX_WIDTH / Math.max(document.documentElement.clientWidth || 1280, 1)),
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      ignoreElements: (el) => el?.getAttribute?.('data-feedback-widget') != null,
    });

    let out = canvas;
    if (canvas.width > MAX_WIDTH) {
      const ratio = MAX_WIDTH / canvas.width;
      const resized = document.createElement('canvas');
      resized.width = MAX_WIDTH;
      resized.height = Math.round(canvas.height * ratio);
      const ctx = resized.getContext('2d');
      ctx.drawImage(canvas, 0, 0, resized.width, resized.height);
      out = resized;
    }

    const blob = await canvasToBlob(out);
    const dataUrl = out.toDataURL('image/jpeg', JPEG_QUALITY);
    return { blob, dataUrl };
  } finally {
    restoreMask();
    restoreWidget();
  }
}
