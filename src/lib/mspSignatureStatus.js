/**
 * MSPWare / BoldSign package completion helpers.
 * Status strings from MSPWare vary (complete, Completed, signed, etc.).
 */

/** True when a package-level signatures response means the envelope is done. */
export function isMspPackageFullySigned(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.signed === true) return true;
  const status = String(data.status || data.envelopeStatus || data.localstatus || '').toLowerCase().trim();
  return ['complete', 'completed', 'signed', 'allsigned', 'all_signed'].includes(status);
}

/** True when an individual signer row on the package is done. */
export function isMspSignerSigned(row) {
  if (!row || typeof row !== 'object') return false;
  if (row.signed === true) return true;
  const status = String(row.localstatus || row.status || row.signerStatus || '').toLowerCase().trim();
  return ['signed', 'complete', 'completed'].includes(status);
}
