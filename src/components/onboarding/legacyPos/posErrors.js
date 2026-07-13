/** Shared user-facing errors for Legacy POS connect flows. */
export function friendlyPosError(msg) {
  const s = String(msg || '');
  if (
    /MerchantPOSConnection not found/i.test(s) ||
    /Entity schema .* not found/i.test(s) ||
    /ENTITY_SCHEMA_MISSING/i.test(s)
  ) {
    return 'POS connection storage is not live in Base44 yet. Publish the MerchantPOSConnection entity, then try again. Your account manager can still help manually.';
  }
  return s || 'Could not notify our team. Please try again.';
}
