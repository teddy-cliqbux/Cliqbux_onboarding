/**
 * Derive merchant-facing location status for Merchant Center lists.
 * External join key remains elavonMID when live — never invent matching on internal IDs.
 */

export const LOCATION_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'live',
  'action_needed',
];

const LIVE_MID = new Set(['Active', 'Active (Existing)']);
const REVIEW_MID = new Set(['Pending MID', 'In Review']);

/**
 * @param {object} location - MerchantLocations row
 * @param {object[]} mids - MerchantMID rows for this location
 * @param {object} [opts]
 * @param {string} [opts.applicationStatus]
 * @param {number} [opts.openChecklistCount]
 * @param {boolean} [opts.quoteMissing]
 */
export function deriveLocationStatus(location, mids = [], opts = {}) {
  const locMids = (mids || []).filter(
    (m) => String(m.locationId) === String(location?.id || location?.locationId)
  );
  const openChecklist = Number(opts.openChecklistCount || 0) > 0;
  const hasError = locMids.some((m) => m.applicationStepStatus === 'Error' || m.mccHelpRequested);
  const anyLive = locMids.some(
    (m) => LIVE_MID.has(m.applicationStepStatus) && m.elavonMID
  );
  const anyPending = locMids.some((m) => REVIEW_MID.has(m.applicationStepStatus));
  const submitted = String(opts.applicationStatus || '') === 'Submitted';

  if (hasError || openChecklist || opts.quoteMissing) {
    return 'action_needed';
  }
  if (anyLive) return 'live';
  if (anyPending || (submitted && locMids.length > 0)) return 'in_review';
  if (submitted) return 'submitted';
  return 'draft';
}

export function locationStatusLabel(status) {
  const map = {
    draft: 'Draft',
    submitted: 'Submitted',
    in_review: 'In review',
    live: 'Live',
    action_needed: 'Action needed',
  };
  return map[status] || status;
}

/** Dot tone for scannable lists */
export function locationStatusTone(status) {
  if (status === 'live') return 'success';
  if (status === 'action_needed') return 'danger';
  if (status === 'in_review' || status === 'submitted') return 'accent';
  return 'neutral';
}

/** Primary MID for display / join key (prefer live with elavonMID) */
export function primaryMidForLocation(location, mids = []) {
  const locMids = (mids || []).filter(
    (m) => String(m.locationId) === String(location?.id || location?.locationId)
  );
  const live = locMids.find((m) => m.elavonMID && LIVE_MID.has(m.applicationStepStatus));
  if (live) return live;
  const anyWithMid = locMids.find((m) => m.elavonMID);
  if (anyWithMid) return anyWithMid;
  return locMids[0] || null;
}
