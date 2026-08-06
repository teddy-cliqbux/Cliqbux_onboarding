/**
 * Deal-scoped MID selection from StagedApplication.includedMidIds
 * (fallback: includedLocationIds → MIDs on those locations).
 * Prepare / sign / submit must honor this so deselected junk MIDs
 * do not get MSPWare drafts or BoldSign packages.
 */

/** @returns {{ midIds: string[]|null, locationIds: string[]|null }} */
export function resolveDealMidScopeFromStages(stages = []) {
  const list = Array.isArray(stages) ? stages : [];
  const preferred = (arr) =>
    arr.find((s) => s.label && s.label !== '__auto_track__') || arr[0];

  const withMid = list.filter(
    (s) => Array.isArray(s?.includedMidIds) && s.includedMidIds.length > 0,
  );
  if (withMid.length) {
    return {
      midIds: preferred(withMid).includedMidIds.map(String),
      locationIds: null,
    };
  }

  const withLoc = list.filter(
    (s) => Array.isArray(s?.includedLocationIds) && s.includedLocationIds.length > 0,
  );
  if (withLoc.length) {
    return {
      midIds: null,
      locationIds: preferred(withLoc).includedLocationIds.map(String),
    };
  }

  return { midIds: null, locationIds: null };
}

/** Filter MerchantMID rows by resolveDealMidScopeFromStages result. */
export function filterMidsByDealScope(mids, scope) {
  if (!mids) return [];
  if (scope?.midIds?.length) {
    const set = new Set(scope.midIds.map(String));
    return mids.filter((m) => m?.id != null && set.has(String(m.id)));
  }
  if (scope?.locationIds?.length) {
    const set = new Set(scope.locationIds.map(String));
    return mids.filter((m) => m?.locationId != null && set.has(String(m.locationId)));
  }
  return mids;
}
