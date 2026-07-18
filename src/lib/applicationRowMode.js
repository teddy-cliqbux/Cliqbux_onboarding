/**
 * Agent Applications row mode — deal-desk brain for /admin/applications.
 *
 * Modes (priority): underwriting > stuck > prep > nudge
 * Permanent Open portal / Copy / Send chrome is gone; only the mode's primary shows.
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
      reason: 'Submitted — underwriting, docs, and equipment',
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
  const lockWithoutSubmit = ['signing', 'pending_signature'].includes(lock);

  // Stuck: real friction after merchant engagement, or idle after they started
  if (
    (merchantTouched && (hasMspErrors || (lockWithoutSubmit && step === 'verification')))
    || (idleStuck && merchantTouched)
    || (hasMspErrors && detailLoaded)
  ) {
    let blocker = null;
    if (hasMspErrors) blocker = `${mspErrorCount} form validation issue${mspErrorCount === 1 ? '' : 's'}`;
    else if (lockWithoutSubmit) blocker = 'Signing package blocked — review form errors';
    else if (idleStuck) blocker = 'No progress in 3+ days';
    return {
      mode: 'stuck',
      reason: blocker || 'Merchant needs agent help',
      blocker,
    };
  }

  // Prep: agent should open portal to prefill locations / MIDs
  const missingLocStep = !!(p.missingByStep?.locations || p.missingCounts?.locations);
  const locationsDone = !!completed.locations;
  if (!locationsDone || step === 'locations' || missingLocStep) {
    return {
      mode: 'prep',
      reason: missingLocStep
        ? 'Locations / MIDs need agent prefill'
        : 'Open portal to prep locations & MIDs',
      blocker: null,
    };
  }

  // Nudge: banking or signing — waiting on merchant
  return {
    mode: 'nudge',
    reason: step === 'banking'
      ? 'Waiting on merchant banking'
      : 'Waiting on merchant to sign',
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
