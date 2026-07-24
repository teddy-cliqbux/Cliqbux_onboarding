/**
 * Portal form lock — signing-phase edit guard.
 *
 * When packages are issued with a usable signing link (or the app is Submitted),
 * locations / MIDs / banking / legal entities / signer KYC must not change until
 * an explicit demoteApplication unlock. Failed signApplication attempts (form
 * incomplete, package create rejected) must NOT lock — merchants need to edit
 * and retry. Maps signing | pending_signature | all_signed onto
 * MerchantCorporateProfile.portalLockStatus.
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
  'Forms are locked — the merchant agreement is out for signature (or already signed). Contact Cliqbux to unlock, or open Deal Room → Unlock & Modify if you are an agent.';

export const FORMS_LOCKED_MESSAGE_AGENT =
  'Forms locked — Unlock & Modify Details retracts live signing packages so you can edit, then Prepare form and Sign again.';

export const FORMS_LOCKED_MESSAGE_ALL_SIGNED =
  'Your agreement is signed. Forms stay locked while Cliqbux reviews and submits to the processor. Contact Cliqbux if something needs to change.';

export const FORMS_LOCKED_MESSAGE_ALL_SIGNED_AGENT =
  'Agreement signed. Submit to the processor from Applications or Deal Room. Unlock only if details must change before submit.';

/** Banner body copy keyed off lock / Submitted. */
export function formsLockedBannerMessage(profile, { canUnlock = false } = {}) {
  if (!profile) return canUnlock ? FORMS_LOCKED_MESSAGE_AGENT : FORMS_LOCKED_MESSAGE;
  if (profile.applicationStatus === 'Submitted') {
    return canUnlock ? FORMS_LOCKED_MESSAGE_ALL_SIGNED_AGENT : FORMS_LOCKED_MESSAGE_ALL_SIGNED;
  }
  const lock = String(profile.portalLockStatus || '').toLowerCase();
  if (lock === PORTAL_LOCK_ALL_SIGNED) {
    return canUnlock ? FORMS_LOCKED_MESSAGE_ALL_SIGNED_AGENT : FORMS_LOCKED_MESSAGE_ALL_SIGNED;
  }
  return canUnlock ? FORMS_LOCKED_MESSAGE_AGENT : FORMS_LOCKED_MESSAGE;
}
/** Backend 423 / manageLegalEntity (etc.) error copy — match for inline unlock CTAs. */
export const FORMS_LOCKED_API_MESSAGE =
  'Forms are locked while the merchant agreement is in signing. Unlock from Deal Room (Applications → Deal room → Unlock & Modify), then edit.';

export const DEMOTE_CONFIRM_MESSAGE =
  'Unlocking will retract MSPWare applications that are out for signature and invalidate all signing links. The merchant will need Prepare form → Sign again. Continue?';

/**
 * True when an API/UI error is the portal form lock (HTTP 423 FORMS_LOCKED).
 * @param {unknown} errOrMessage
 */
export function isFormsLockedError(errOrMessage) {
  if (!errOrMessage) return false;
  const msg = typeof errOrMessage === 'string'
    ? errOrMessage
    : String(errOrMessage?.message || errOrMessage?.error || errOrMessage?.data?.error || '');
  const code = typeof errOrMessage === 'object' && errOrMessage
    ? String(errOrMessage?.code || errOrMessage?.data?.code || '')
    : '';
  return code === 'FORMS_LOCKED'
    || /forms are locked|unlock & modify details/i.test(msg);
}

/**
 * True when at least one MID has a signing link or a completed signature.
 * Error-only rows (form incomplete / package rejected) do not count.
 * @param {object|null|undefined} data — signApplication response body
 */
export function hasUsableSigningPackage(data) {
  if (data?.hasUsableSigningPackage === true) return true;
  return (data?.applications || []).some((a) =>
    a?.allSigned
    || a?.signingUrl
    || (a?.signers || []).some((s) => s?.signingUrl || s?.signed)
  );
}

/**
 * Apply portal lock from a signApplication response.
 * Locks only when a usable package exists; otherwise always unlocks so a
 * failed link generation cannot leave the merchant stuck on Forms Locked.
 * @param {object|null|undefined} data
 * @param {(status: string) => void} setPortalLockStatus
 */
export function applyPortalLockFromSigningResponse(data, setPortalLockStatus) {
  if (!setPortalLockStatus) return;
  if (hasUsableSigningPackage(data)) {
    const next = data?.portalLockStatus || PORTAL_LOCK_SIGNING;
    setPortalLockStatus(next);
    return;
  }
  setPortalLockStatus(PORTAL_LOCK_UNLOCKED);
}
