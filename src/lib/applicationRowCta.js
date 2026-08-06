/**
 * Applications desk CTA helpers — Submit vs Open to prep / underwriting.
 * Keep visibleMids deal-scoped (dealMidSelection) before calling these.
 */

export const BOARDING_DONE_STATUSES = ['Pending MID', 'Active', 'Active (Existing)'];

/** True when at least one visible MID still needs processor submit. */
export function midsNeedProcessorSubmit(visibleMids = []) {
  if (!Array.isArray(visibleMids) || visibleMids.length === 0) return false;
  return visibleMids.some((m) => !BOARDING_DONE_STATUSES.includes(m?.applicationStepStatus));
}

/**
 * Show Submit to processor when signed/submitted and visible MIDs are not yet boarded.
 * Do not treat MSP health-not-loaded as needs-submit.
 */
export function shouldShowProcessorSubmit({
  needsSubmitAfterSign = false,
  isSubmitted = false,
  agreementSigned = false,
  visibleMids = [],
} = {}) {
  const signedOrSubmitted = !!(needsSubmitAfterSign || isSubmitted || agreementSigned);
  return signedOrSubmitted && midsNeedProcessorSubmit(visibleMids);
}

/** Hide Open to prep when signed (Submit is primary) or underwriting/stuck/submitted. */
export function shouldShowOpenToPrep({
  isSubmitted = false,
  mode = null,
  needsSubmitAfterSign = false,
} = {}) {
  if (isSubmitted) return false;
  if (mode === 'underwriting' || mode === 'stuck') return false;
  if (needsSubmitAfterSign) return false;
  return mode === 'prep' || mode === 'nudge';
}