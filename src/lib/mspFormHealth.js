/**
 * MSPWare form health for Applications deal-desk.
 * Incomplete % / -1% / processor validation must surface as agent "stuck" work,
 * not "Remind" (waiting on merchant to sign).
 */

/** Collect error-like entries from a getMSPFormStatus payload (any shape). */
export function collectMspStatusErrors(status) {
  if (!status || typeof status !== 'object') return [];
  const raw = status.rawForm && typeof status.rawForm === 'object' ? status.rawForm : {};
  const validation = status.validation || raw.validation || {};
  const vErrors = validation.errors || {};
  const list = [
    ...(status.completion_errors || []),
    ...(status.data_errors || []),
    ...(status.rule_violations || []),
    ...(status.errors || []),
    ...(vErrors.completion || []),
    ...(vErrors.data || []),
    ...(Array.isArray(vErrors) ? vErrors : []),
  ];
  return list.filter((e) => e != null && e !== '');
}

export function countMspStatusErrors(status) {
  return collectMspStatusErrors(status).length;
}

/**
 * True when the MSP form is not ready for BoldSign — agent should Open to fix.
 * @param {object|null} status — getMSPFormStatus response
 */
export function mspFormNeedsAgentFix(status) {
  if (!status) return false;
  const errCount = countMspStatusErrors(status);
  if (errCount > 0) return true;

  const pctRaw = status.percent_complete;
  if (pctRaw != null && pctRaw !== '') {
    const pct = parseFloat(String(pctRaw));
    if (Number.isFinite(pct) && (pct < 0 || pct < 100)) return true;
  }

  if (status.canSave === false) return true;
  if (status.canSubmit === false && pctRaw != null) {
    const pct = parseFloat(String(pctRaw));
    if (Number.isFinite(pct) && pct < 100) return true;
  }

  return false;
}

/**
 * Aggregate across multiple MID status payloads.
 * @returns {{ errorCount: number, incomplete: boolean, worstPct: number|null }}
 */
export function summarizeMspHealth(statuses) {
  const list = Array.isArray(statuses) ? statuses.filter(Boolean) : Object.values(statuses || {}).filter(Boolean);
  let errorCount = 0;
  let incomplete = false;
  let worstPct = null;
  for (const s of list) {
    errorCount += countMspStatusErrors(s);
    if (mspFormNeedsAgentFix(s)) incomplete = true;
    if (s.percent_complete != null && s.percent_complete !== '') {
      const pct = parseFloat(String(s.percent_complete));
      if (Number.isFinite(pct)) {
        worstPct = worstPct == null ? pct : Math.min(worstPct, pct);
      }
    }
  }
  return { errorCount, incomplete, worstPct };
}
