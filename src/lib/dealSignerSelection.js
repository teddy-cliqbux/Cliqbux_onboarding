/**
 * Deal-scoped signer selection from StagedApplication.includedSignerIds.
 * Agents prep which owners appear on this deal — only selected IDs should show
 * in the portal People step / signing roster / MSPWare owners[]. Mirror of
 * dealLocationSelection.js (locations/MIDs).
 */

/** @returns {string[]|null} null = no selection (show all) */
export function resolveIncludedSignerIdsFromStages(stages = []) {
  const list = Array.isArray(stages) ? stages : [];
  const withSel = list.filter(
    (s) => Array.isArray(s?.includedSignerIds) && s.includedSignerIds.length > 0
  );
  if (!withSel.length) return null;
  const preferred =
    withSel.find((s) => s.label && s.label !== '__auto_track__')
    || withSel[0];
  return preferred.includedSignerIds.map(String);
}

export function filterByIncludedSignerIds(signers, includedIds) {
  if (!includedIds || !includedIds.length) return signers || [];
  const set = new Set(includedIds.map(String));
  return (signers || []).filter((s) => s?.id != null && set.has(String(s.id)));
}
