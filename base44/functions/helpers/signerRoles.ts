/**
 * Deno copy — inline into manageSigner / signApplication / submitToMSP between
 * sync markers. Keep in sync with src/lib/signerRules.js (role helpers only).
 */

function ownershipPct(s: any): number {
  const n = Number(s?.ownershipPercentage);
  return Number.isFinite(n) ? n : 0;
}

function isPortalAdmin(s: any): boolean {
  return s?.isPortalAdmin === true;
}

function isControlPerson(s: any): boolean {
  if (!s || isPortalAdmin(s)) return false;
  if (s.isAuthorizedSigner === true) return true;
  if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
  return false;
}

function isBeneficialOwner(s: any): boolean {
  if (!s || isPortalAdmin(s)) return false;
  if (s.isBeneficialOwner === true) return true;
  if (s.isBeneficialOwner === false) return ownershipPct(s) >= 25;
  return ownershipPct(s) >= 25;
}

function isAmlPrincipal(s: any): boolean {
  if (!s || isPortalAdmin(s)) return false;
  return isControlPerson(s) || isBeneficialOwner(s);
}

function normalizePersonRoleFlags(input: Record<string, any> = {}) {
  const pct = ownershipPct(input);
  let isPortalAdminFlag = input.isPortalAdmin === true;
  let isAuthorizedSigner = input.isAuthorizedSigner === true
    || (input.isAuthorizedSigner == null && input.isPrimarySigner === true);
  let isPrimarySigner = input.isPrimarySigner === true || isAuthorizedSigner;

  if (isPortalAdminFlag) {
    isAuthorizedSigner = false;
    isPrimarySigner = false;
  }

  const ownershipPercentage = isPortalAdminFlag ? 0 : pct;
  let isBeneficialOwnerFlag = !isPortalAdminFlag && (input.isBeneficialOwner === true || ownershipPercentage >= 25);
  if (isPortalAdminFlag) isBeneficialOwnerFlag = false;
  if (!isPortalAdminFlag && ownershipPercentage >= 25) isBeneficialOwnerFlag = true;
  if (!isPortalAdminFlag && ownershipPercentage < 25 && input.isBeneficialOwner !== true) {
    isBeneficialOwnerFlag = false;
  }
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
