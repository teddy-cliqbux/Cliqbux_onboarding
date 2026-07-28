/**
 * Deal-scoped location selection from StagedApplication.includedLocationIds.
 * Agents board locations in waves — only selected IDs should appear in portal
 * / Applications MID lists, and HubSpot sync must not recreate deselected ones.
 */

/** @returns {string[]|null} null = no selection (show all) */
export function resolveIncludedLocationIdsFromStages(stages = []) {
  const list = Array.isArray(stages) ? stages : [];
  const withSel = list.filter(
    (s) => Array.isArray(s?.includedLocationIds) && s.includedLocationIds.length > 0
  );
  if (!withSel.length) return null;
  const preferred =
    withSel.find((s) => s.label && s.label !== '__auto_track__')
    || withSel[0];
  return preferred.includedLocationIds.map(String);
}

export function filterByIncludedLocationIds(records, includedIds, idKeys = ['id', 'locationId']) {
  if (!includedIds || !includedIds.length) return records || [];
  const set = new Set(includedIds.map(String));
  return (records || []).filter((r) => {
    for (const k of idKeys) {
      if (r?.[k] != null && set.has(String(r[k]))) return true;
    }
    // MIDs: match parent locationId
    if (r?.locationId != null && set.has(String(r.locationId))) return true;
    return false;
  });
}
