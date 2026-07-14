import {
  isVerifiedOrHigher,
  isApplicationSigned,
  isInviteOutstanding,
  normalizeSignerLifecycle,
} from './signerLifecycle';

/** Required for the signing state machine: ≥25% ownership OR primary. Under-25% non-primaries are roster-only. */
export function isRequiredSigner(s) {
  return s?.isPrimarySigner === true || (Number(s?.ownershipPercentage) || 0) >= 25;
}

/** Cleared enough to participate in signing prep (invite out, verified, or signed). */
export function isClearedForSigning(s) {
  const n = normalizeSignerLifecycle(s?.identityStatus);
  return n === 'verified'
    || n === 'application signed'
    || n === 'invited'
    || n === 'opened';
}

export { isVerifiedOrHigher, isApplicationSigned, isInviteOutstanding, normalizeSignerLifecycle };
