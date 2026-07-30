/**
 * Derived MerchantAccount portfolio status (not stored on the entity).
 * Priority: needs_attention → live → onboarding → prospect.
 *
 * corporateId on deals is a HubSpot Deal ID — never treat it as the account id.
 */

export const ACCOUNT_STATUSES = [
  'needs_attention',
  'live',
  'onboarding',
  'prospect',
];

export const ACCOUNT_STATUS_LABELS = {
  needs_attention: 'Needs attention',
  live: 'Live',
  onboarding: 'Onboarding',
  prospect: 'Prospect',
};

const LIVE_MID_STATUSES = new Set(['Active', 'Active (Existing)']);
const PENDING_MID_STATUSES = new Set(['Pending MID']);
const ONBOARDING_APP_STATUSES = new Set([
  'Incomplete',
  'Quote Signed',
  'Submitted',
]);

/**
 * @param {object|null|undefined} mid
 * @returns {boolean}
 */
export function isLiveMid(mid) {
  return LIVE_MID_STATUSES.has(String(mid?.applicationStepStatus || ''));
}

/**
 * @param {object|null|undefined} mid
 * @returns {boolean}
 */
export function isPendingMid(mid) {
  return PENDING_MID_STATUSES.has(String(mid?.applicationStepStatus || ''));
}

/**
 * @param {object|null|undefined} mid
 * @returns {boolean}
 */
export function midNeedsAttention(mid) {
  if (!mid) return false;
  if (String(mid.applicationStepStatus || '') === 'Error') return true;
  if (mid.mccHelpRequested === true) return true;
  return false;
}

/**
 * @param {Array<object>} [mids]
 * @returns {{ total: number, live: number, pending: number, error: number, other: number }}
 */
export function countMids(mids = []) {
  const list = Array.isArray(mids) ? mids : [];
  let live = 0;
  let pending = 0;
  let error = 0;
  let other = 0;
  for (const m of list) {
    const st = String(m?.applicationStepStatus || '');
    if (LIVE_MID_STATUSES.has(st)) live += 1;
    else if (PENDING_MID_STATUSES.has(st)) pending += 1;
    else if (st === 'Error') error += 1;
    else other += 1;
  }
  return { total: list.length, live, pending, error, other };
}

/**
 * @param {object|null|undefined} deal — MerchantCorporateProfile
 * @returns {boolean}
 */
export function isOnboardingDeal(deal) {
  if (!deal) return false;
  const app = String(deal.applicationStatus || 'Incomplete');
  if (ONBOARDING_APP_STATUSES.has(app)) return true;
  const handoff = String(deal.handoffStage || '').toLowerCase();
  if (handoff && handoff !== 'support') return true;
  return false;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.formIncomplete]
 * @param {number} [opts.mspErrorCount]
 * @returns {boolean}
 */
export function dealHasAttentionHints(opts = {}) {
  if (opts.formIncomplete === true) return true;
  if ((Number(opts.mspErrorCount) || 0) > 0) return true;
  return false;
}

/**
 * @param {object} args
 * @param {Array<object>} [args.deals]
 * @param {Array<object>} [args.mids]
 * @param {Record<string, { formIncomplete?: boolean, mspErrorCount?: number }>} [args.dealAttention]
 *   keyed by corporateId (Deal ID)
 * @returns {'needs_attention'|'live'|'onboarding'|'prospect'}
 */
export function deriveAccountStatus({ deals = [], mids = [], dealAttention = {} } = {}) {
  const dealList = Array.isArray(deals) ? deals : [];
  const midList = Array.isArray(mids) ? mids : [];

  if (midList.some(midNeedsAttention)) return 'needs_attention';

  for (const d of dealList) {
    const cid = String(d?.corporateId || '');
    if (cid && dealHasAttentionHints(dealAttention[cid] || {})) {
      return 'needs_attention';
    }
  }

  if (midList.some(isLiveMid)) return 'live';

  if (dealList.some(isOnboardingDeal)) return 'onboarding';

  return 'prospect';
}

/**
 * Latest activity timestamp across deals (ISO string or null).
 * @param {Array<object>} [deals]
 * @returns {string|null}
 */
export function latestDealActivity(deals = []) {
  let best = null;
  let bestMs = 0;
  for (const d of Array.isArray(deals) ? deals : []) {
    const raw = d?.updated_date || d?.updatedAt || d?.created_date || null;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = String(raw);
    }
  }
  return best;
}
