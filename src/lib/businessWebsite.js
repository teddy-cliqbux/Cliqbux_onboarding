/**
 * Business homepage URL — required when Online (internet) card split > 0.
 * Merchants often paste bare domains ("myshop.com") or junk ("asdf", "http://").
 * Normalize then validate before save / MSPWare.
 */

const HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/**
 * @param {string} raw
 * @returns {string} trimmed URL with https:// if scheme missing, or ''
 */
export function normalizeBusinessWebsite(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  // Trailing punctuation from chat/email paste
  s = s.replace(/[.,;)\]]+$/g, '');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidBusinessWebsite(raw) {
  const normalized = normalizeBusinessWebsite(raw);
  if (!normalized) return false;
  let url;
  try {
    url = new URL(normalized);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = String(url.hostname || '').toLowerCase();
  if (!host || host === 'localhost') return false;
  // No IPv4/IPv6 as a "homepage" for underwriting
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false;
  if (!HOST_RE.test(host)) return false;
  return true;
}

/**
 * @param {string} raw
 * @param {{ required?: boolean }} [opts]
 * @returns {string|null} error message, or null if OK / not required empty
 */
export function businessWebsiteError(raw, opts = {}) {
  const required = !!opts.required;
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return required
      ? 'Business homepage URL is required when Online volume is greater than 0%.'
      : null;
  }
  if (!isValidBusinessWebsite(trimmed)) {
    return 'Enter a valid website (e.g. https://www.example.com or example.com).';
  }
  return null;
}
