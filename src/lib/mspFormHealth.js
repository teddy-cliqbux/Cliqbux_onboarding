/**
 * MSPWare form health for Applications deal-desk.
 * Incomplete % / -1% / processor validation must surface as agent "stuck" work,
 * not "Remind" (waiting on merchant to sign).
 *
 * Do NOT treat canSave:false alone as incomplete — MSPWare often returns that
 * when the form is 100% and locked for signing (Porky's 2026-07-20 false stuck).
 */

function isMeaningfulError(e) {
  if (e == null || e === '') return false;
  if (typeof e === 'string') return e.trim().length > 0;
  if (typeof e === 'object') {
    const detail = e.errors ?? e.message ?? e.description ?? e.label ?? e.key;
    if (detail == null || detail === '') {
      return Object.keys(e).length > 0 && Boolean(e.key || e.field || e.name);
    }
    return String(detail).trim().length > 0;
  }
  return true;
}

/** Collect error-like entries from a getMSPFormStatus payload (any shape). */
export function collectMspStatusErrors(status) {
  if (!status || typeof status !== 'object') return [];
  const raw = status.rawForm && typeof status.rawForm === 'object' ? status.rawForm : {};
  // Prefer top-level arrays from getMSPFormStatus (already flattened). Only fall
  // back to rawForm.validation when top-level lists are absent — avoids double-count
  // and picking up stale nested shapes.
  const hasTopLevel =
    Array.isArray(status.completion_errors)
    || Array.isArray(status.data_errors)
    || Array.isArray(status.rule_violations)
    || Array.isArray(status.errors);

  const list = [
    ...(status.completion_errors || []),
    ...(status.data_errors || []),
    ...(status.rule_violations || []),
    ...(status.errors || []),
  ];

  if (!hasTopLevel || list.length === 0) {
    const validation = status.validation || raw.validation || {};
    const vErrors = validation.errors || {};
    list.push(
      ...(vErrors.completion || []),
      ...(vErrors.data || []),
      ...(Array.isArray(vErrors) ? vErrors : []),
    );
  }

  return list.filter(isMeaningfulError);
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
    if (Number.isFinite(pct)) {
      // 100% + no errors = ready to sign (ignore canSave / canSubmit)
      if (pct >= 100) return false;
      if (pct < 0 || pct < 100) return true;
    }
  }

  // Without a percent, canSave:false is a weak signal only — MSPWare defaults
  // and our ?? false coercion made every signing-ready form look stuck.
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
