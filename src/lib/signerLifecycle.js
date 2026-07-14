/**
 * Signer lifecycle (identityStatus) — canonical micro-funnel for admin + remote verify.
 *
 * Canonical writes (2026-07-13):
 *   invited | opened | verified | application signed | signing failed
 *
 * Legacy values still appear on older records and are normalized for UI/gates:
 *   Pending Invitation | Sent | Verified | Signed | Action Required
 */

export const SIGNER_LIFECYCLE = {
  PENDING: 'Pending Invitation',
  INVITED: 'invited',
  OPENED: 'opened',
  VERIFIED: 'verified',
  APPLICATION_SIGNED: 'application signed',
  SIGNING_FAILED: 'signing failed',
};

/** Normalize any stored identityStatus into the micro-funnel key. */
export function normalizeSignerLifecycle(status) {
  const s = String(status || '').trim();
  if (!s || s === 'Pending Invitation') return 'pending';
  if (s === 'Sent' || s === 'invited') return 'invited';
  if (s === 'opened') return 'opened';
  if (s === 'Verified' || s === 'verified') return 'verified';
  if (s === 'Signed' || s === 'application signed') return 'application signed';
  if (s === 'Action Required' || s === 'signing failed') return 'signing failed';
  return s.toLowerCase();
}

export function lifecycleLabel(status) {
  const n = normalizeSignerLifecycle(status);
  const labels = {
    pending: 'Pending',
    invited: 'Invited',
    opened: 'Opened',
    verified: 'Verified',
    'application signed': 'Application signed',
    'signing failed': 'Signing failed',
  };
  return labels[n] || status || 'Pending';
}

/** High-fidelity admin badge classes (per product spec). */
export function lifecycleBadgeClass(status) {
  const n = normalizeSignerLifecycle(status);
  const map = {
    pending: 'bg-slate-800/50 text-slate-400 border border-slate-700',
    invited: 'bg-slate-800/50 text-slate-400 border border-slate-700',
    opened: 'bg-sky-950/40 text-sky-400 border border-sky-800',
    verified: 'bg-amber-950/40 text-amber-400 border border-amber-800',
    'application signed': 'bg-emerald-950/40 text-emerald-400 border border-emerald-800',
    'signing failed': 'bg-rose-950/40 text-rose-400 border border-rose-800',
  };
  return map[n] || map.pending;
}

export function isVerifiedOrHigher(status) {
  const n = normalizeSignerLifecycle(status);
  return n === 'verified' || n === 'application signed';
}

export function isApplicationSigned(status) {
  return normalizeSignerLifecycle(status) === 'application signed';
}

/** Invite sent / link opened but KYC not done yet. */
export function isInviteOutstanding(status) {
  const n = normalizeSignerLifecycle(status);
  return n === 'invited' || n === 'opened';
}

/** Statuses that may transition to `opened` on first link click. */
export function canMarkOpened(status) {
  const n = normalizeSignerLifecycle(status);
  return n === 'pending' || n === 'invited';
}
