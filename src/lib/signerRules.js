/** Required for the signing state machine: ≥25% ownership OR primary. Under-25% non-primaries are roster-only. */
export function isRequiredSigner(s) {
  return s?.isPrimarySigner === true || (Number(s?.ownershipPercentage) || 0) >= 25;
}

export function isClearedForSigning(s) {
  return s?.identityStatus === 'Verified'
    || s?.identityStatus === 'Sent'
    || s?.identityStatus === 'Signed';
}
