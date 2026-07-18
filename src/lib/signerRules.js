/**
 * Signer / principal role rules for Cliqbux boarding.
 *
 * Roles (see docs/adr/0003-signer-roles-control-bo-admin.md + CONTEXT.md):
 * - Control Person (Legal Signer / Authorized Signer) — exactly one; BoldSign
 * - Beneficial Owner (≥25%) — KYC/AML principals; sign only if also Control Person
 * - Portal Admin (0%, admin only) — no contract principals; gateway user later
 *
 * Keep in sync with base44/functions/helpers/signerRoles.ts (inlined into
 * manageSigner, signApplication, submitToMSP).
 */

import {
  isVerifiedOrHigher,
  isApplicationSigned,
  isInviteOutstanding,
  normalizeSignerLifecycle,
} from './signerLifecycle';

export function ownershipPct(s) {
  const n = Number(s?.ownershipPercentage);
  return Number.isFinite(n) ? n : 0;
}

/** Portal Admin — excluded from contract / BoldSign. */
export function isPortalAdmin(s) {
  return s?.isPortalAdmin === true;
}

/**
 * Control Person / Authorized Signer.
 * Legacy: isPrimarySigner counts as Control Person (pre-role-flag records).
 */
export function isControlPerson(s) {
  if (!s || isPortalAdmin(s)) return false;
  if (s.isAuthorizedSigner === true) return true;
  // Legacy: primary signer was the Control Person before explicit flags
  if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
  return false;
}

/** Beneficial Owner — ≥25% or explicit flag (never Portal Admin). */
export function isBeneficialOwner(s) {
  if (!s || isPortalAdmin(s)) return false;
  if (s.isBeneficialOwner === true) return true;
  if (s.isBeneficialOwner === false) return ownershipPct(s) >= 25;
  return ownershipPct(s) >= 25;
}

/** Must appear on MSPWare owners[] for AML / contract principals. */
export function isAmlPrincipal(s) {
  if (!s || isPortalAdmin(s)) return false;
  return isControlPerson(s) || isBeneficialOwner(s);
}

/** Must complete KYC (name, SSN, DOB, address). */
export function needsKyc(s) {
  return isAmlPrincipal(s);
}

/**
 * Must receive BoldSign / block Deal completion on signature.
 * @deprecated name kept for call sites — means Control Person only now.
 */
export function isRequiredSigner(s) {
  return isControlPerson(s);
}

/** Normalize flags before persist (create/update). */
export function normalizePersonRoleFlags(input = {}) {
  const pct = ownershipPct(input);
  let isPortalAdminFlag = input.isPortalAdmin === true;
  let isAuthorizedSigner = input.isAuthorizedSigner === true
    || (input.isAuthorizedSigner == null && input.isPrimarySigner === true);
  let isPrimarySigner = input.isPrimarySigner === true || isAuthorizedSigner;

  if (isPortalAdminFlag) {
    isAuthorizedSigner = false;
    isPrimarySigner = false;
  }

  // Portal admin implies 0% and not BO
  const ownershipPercentage = isPortalAdminFlag ? 0 : pct;
  let isBeneficialOwnerFlag = !isPortalAdminFlag && (input.isBeneficialOwner === true || ownershipPercentage >= 25);
  if (isPortalAdminFlag) isBeneficialOwnerFlag = false;
  if (!isPortalAdminFlag && ownershipPercentage >= 25) isBeneficialOwnerFlag = true;
  if (!isPortalAdminFlag && ownershipPercentage < 25 && input.isBeneficialOwner !== true) {
    isBeneficialOwnerFlag = false;
  }

  // Control person cannot also be portal admin
  if (isAuthorizedSigner) isPortalAdminFlag = false;

  return {
    ownershipPercentage,
    isPortalAdmin: isPortalAdminFlag,
    isAuthorizedSigner,
    isPrimarySigner,
    isBeneficialOwner: isBeneficialOwnerFlag,
    needsGatewayUserProvisioning: isPortalAdminFlag === true,
  };
}

export function countControlPersons(signers = []) {
  return (signers || []).filter(isControlPerson).length;
}

/**
 * When zero Control Persons are flagged, the sole non-admin person on the deal
 * is the Control Person (common after role-flag migrations that left only BO).
 * Returns that person or null if ambiguous / already has a control.
 */
export function resolveSoleControlCandidate(signers = []) {
  if (countControlPersons(signers) > 0) return null;
  const nonAdmin = (signers || []).filter((s) => s && !isPortalAdmin(s));
  if (nonAdmin.length !== 1) return null;
  return nonAdmin[0];
}

/** Real Control Persons, or the sole-owner candidate when none are flagged. */
export function effectiveControlPersons(signers = []) {
  const real = (signers || []).filter(isControlPerson);
  if (real.length > 0) return real;
  const sole = resolveSoleControlCandidate(signers);
  return sole ? [sole] : [];
}

/** BoldSign required — Control Person, including sole-owner heal candidate. */
export function isEffectivelyRequiredSigner(s, allSigners = []) {
  if (isControlPerson(s)) return true;
  const sole = resolveSoleControlCandidate(allSigners);
  return !!(sole && s && sole.id === s.id);
}

export function assertSignerRosterRules(signers = []) {
  const list = signers || [];
  const controls = list.filter(isControlPerson);
  if (controls.length === 0) {
    return { ok: false, error: 'Designate exactly one Control Person (Authorized Signer) before continuing.' };
  }
  if (controls.length > 1) {
    return { ok: false, error: 'Only one Control Person (Authorized Signer) is allowed per application.' };
  }
  const kycMissing = list.filter(needsKyc).filter((s) => !isVerifiedOrHigher(s?.identityStatus));
  // Soft: roster validity for “continue” often allows invited/opened — callers choose
  return { ok: true, controlPerson: controls[0], kycIncomplete: kycMissing };
}

/** Cleared enough for Control Person signing prep (invite out, verified, or signed). */
export function isClearedForSigning(s) {
  const n = normalizeSignerLifecycle(s?.identityStatus);
  return n === 'verified'
    || n === 'application signed'
    || n === 'invited'
    || n === 'opened';
}

/** Beneficial Owner / Control Person KYC ready (verified or higher). */
export function isKycComplete(s) {
  if (!needsKyc(s)) return true;
  return isVerifiedOrHigher(s?.identityStatus);
}

export { isVerifiedOrHigher, isApplicationSigned, isInviteOutstanding, normalizeSignerLifecycle };
