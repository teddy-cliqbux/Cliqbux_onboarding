/**
 * Portal form lock — signing-phase edit guard.
 *
 * When packages are issued (or the app is Submitted), locations / MIDs /
 * banking / legal entities / signer KYC must not change until an explicit
 * demoteApplication unlock. Maps the product intent of
 * signing | pending_signature | all_signed onto MerchantCorporateProfile.portalLockStatus.
 */

export const PORTAL_LOCK_SIGNING = 'signing';
export const PORTAL_LOCK_PENDING_SIGNATURE = 'pending_signature';
export const PORTAL_LOCK_ALL_SIGNED = 'all_signed';
export const PORTAL_LOCK_UNLOCKED = 'unlocked';

/** Statuses that freeze merchant data-entry forms. */
export const PORTAL_FORMS_LOCKED_STATUSES = [
  PORTAL_LOCK_SIGNING,
  PORTAL_LOCK_PENDING_SIGNATURE,
  PORTAL_LOCK_ALL_SIGNED,
];

/**
 * @param {object|null|undefined} profile
 * @returns {boolean}
 */
export function isPortalFormsLocked(profile) {
  if (!profile) return false;
  if (profile.applicationStatus === 'Submitted') return true;
  const lock = String(profile.portalLockStatus || PORTAL_LOCK_UNLOCKED).toLowerCase();
  return PORTAL_FORMS_LOCKED_STATUSES.includes(lock);
}

/**
 * Human-readable lock label for banners.
 * @param {object|null|undefined} profile
 */
export function portalLockLabel(profile) {
  if (!profile) return 'locked';
  if (profile.applicationStatus === 'Submitted') return 'submitted';
  const lock = String(profile.portalLockStatus || '').toLowerCase();
  if (lock === PORTAL_LOCK_ALL_SIGNED) return 'all signed';
  if (lock === PORTAL_LOCK_PENDING_SIGNATURE) return 'pending signature';
  if (lock === PORTAL_LOCK_SIGNING) return 'ready for signature';
  return 'locked';
}

export const FORMS_LOCKED_MESSAGE =
  'Forms Locked — Application is ready for signature. Click Unlock & Modify Details to edit.';

export const DEMOTE_CONFIRM_MESSAGE =
  'Unlocking this application will instantly invalidate all current signature links. Outstanding signers will need to verify and sign a newly updated agreement. Are you sure you want to continue?';
