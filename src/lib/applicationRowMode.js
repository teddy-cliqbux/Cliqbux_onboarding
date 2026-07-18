/**
 * Agent Applications row mode — deal-desk brain for /admin/applications.
 *
 * Modes (priority): underwriting > stuck > prep > nudge
 * Copy targets sales agents mid-call: verb + outcome, no MSPWare jargon.
 */

const STUCK_IDLE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * @typedef {'prep'|'nudge'|'stuck'|'underwriting'} ApplicationRowMode
 */

/**
 * @param {object} args
 * @param {object|null} args.profile
 * @param {object|null} args.track — StagedApplication __auto_track__
 * @param {{ currentStep: string, completedSteps: object, appStatus: string }} args.pipeline
 * @param {number} [args.mspErrorCount]
 * @param {boolean} [args.detailLoaded]
 * @returns {{ mode: ApplicationRowMode, reason: string, blocker: string|null }}
 */
export function resolveApplicationRowMode({
  profile,
  track,
  pipeline,
  mspErrorCount = 0,
  detailLoaded = false,
}) {
  const p = track?.prefilledData || {};
  const activity = p.activity || {};
  const appStatus = pipeline?.appStatus || profile?.applicationStatus || 'Incomplete';
  const step = pipeline?.currentStep || 'locations';
  const completed = pipeline?.completedSteps || {};

  if (appStatus === 'Submitted' || step === 'submitted') {
    return {
      mode: 'underwriting',
      reason: 'Submitted — open dashboard for equipment, payment, and documents',
      blocker: null,
    };
  }

  const merchantTouched = (Number(activity.merchantOpens) || 0) > 0 || !!p.lastSeenAt;
  const lock = String(profile?.portalLockStatus || '').toLowerCase();
  const idleStuck = !!(
    p.lastSeenAt
    && (Date.now() - new Date(p.lastSeenAt).getTime()) > STUCK_IDLE_MS
  );
  const hasMspErrors = (Number(mspErrorCount) || 0) > 0;
  const awaitingSignature = ['signing', 'pending_signature'].includes(lock);

  // Real blockers only — do NOT treat "forms locked / ready for signature" as a
  // failed signing link. That lock means packages exist and we're waiting on the merchant.
  if (
    (merchantTouched && hasMspErrors)
    || (idleStuck && merchantTouched)
    || (hasMspErrors && detailLoaded)
  ) {
    let blocker = null;
    if (hasMspErrors) {
      blocker = `${mspErrorCount} application error${mspErrorCount === 1 ? '' : 's'} — open to fix`;
    } else if (idleStuck) {
      blocker = 'No progress in 3+ days';
    }
    return {
      mode: 'stuck',
      reason: blocker || 'Merchant needs help — open their application',
      blocker,
    };
  }

  const missingLocStep = !!(p.missingByStep?.locations || p.missingCounts?.locations);
  const locationsDone = !!completed.locations;
  if (!locationsDone || step === 'locations' || missingLocStep) {
    return {
      mode: 'prep',
      reason: missingLocStep
        ? 'Add locations and merchant IDs before the merchant continues'
        : 'Open their application to add locations and merchant IDs',
      blocker: null,
    };
  }

  if (awaitingSignature && (step === 'verification' || step === 'verify')) {
    return {
      mode: 'nudge',
      reason: 'Merchant agreement is ready — waiting for them to sign',
      blocker: null,
    };
  }

  return {
    mode: 'nudge',
    reason: step === 'banking'
      ? 'Waiting on the merchant to connect a bank account'
      : 'Waiting on the merchant to verify and sign',
    blocker: null,
  };
}

export const NUDGE_PREF_KEY = 'cb_agent_nudge_channel';

/** @returns {'sms'|'email'|'both'} */
export function readNudgeChannelPref() {
  try {
    const v = localStorage.getItem(NUDGE_PREF_KEY);
    if (v === 'sms' || v === 'email' || v === 'both') return v;
  } catch { /* private mode */ }
  return 'both';
}

/** @param {'sms'|'email'|'both'} channel */
export function writeNudgeChannelPref(channel) {
  try {
    localStorage.setItem(NUDGE_PREF_KEY, channel);
  } catch { /* private mode */ }
}
