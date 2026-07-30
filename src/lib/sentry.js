/**
 * Sentry init + PII scrubbers for the Cliqbux portal / admin SPA.
 * No-ops when VITE_SENTRY_DSN is unset (local/dev without monitoring).
 *
 * See docs/superpowers/specs/2026-07-29-feedback-fix-loop-design.md
 */
import * as Sentry from '@sentry/react';

const SENSITIVE_KEY = /^(ssn|social|routing|account|accountnumber|account_number|routingnumber|routing_number|password|plaid|access_token|accessToken|secret|authorization|bearer|merchant_jwt|jwt)$/i;
const SSN_RE = /\b\d{3}-?\d{2}-?\d{4}\b/g;
const ROUTING_RE = /\b\d{9}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9\-._~+/=]+/gi;

function scrubString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(SSN_RE, '[REDACTED-SSN]')
    .replace(ROUTING_RE, (m) => (m.length === 9 ? '[REDACTED-NUM]' : m));
}

function scrubDeep(input, depth = 0) {
  if (depth > 6 || input == null) return input;
  if (typeof input === 'string') return scrubString(input);
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((v) => scrubDeep(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = scrubDeep(v, depth + 1);
    }
  }
  return out;
}

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE || 'production',
    tracesSampleRate: 0.05,
    beforeSend(event) {
      try {
        if (event.message) event.message = scrubString(event.message);
        if (event.exception?.values) {
          for (const ex of event.exception.values) {
            if (ex.value) ex.value = scrubString(ex.value);
          }
        }
        if (event.request) event.request = scrubDeep(event.request);
        if (event.extra) event.extra = scrubDeep(event.extra);
        if (event.contexts) event.contexts = scrubDeep(event.contexts);
        if (event.user) {
          // Keep id/role tags only — drop email/IP if present
          event.user = {
            id: event.user.id ? String(event.user.id) : undefined,
          };
        }
      } catch {
        /* never block send on scrub failure */
      }
      return event;
    },
  });

  return true;
}

/** Update Sentry scope with portal context (safe tags only). */
export function setSentryPortalContext({ corporateId, impersonating, route } = {}) {
  if (!import.meta.env.VITE_SENTRY_DSN) return;
  Sentry.setTag('route', route || (typeof window !== 'undefined' ? window.location.pathname : ''));
  if (corporateId) Sentry.setTag('corporateId', String(corporateId));
  Sentry.setTag('impersonating', impersonating ? 'true' : 'false');
}

export { Sentry };
