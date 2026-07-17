/**
 * CA/NY Bar & Tavern (MCC 5813 family) underwriting rules.
 * Single source of truth for portal UI + readiness checks.
 * Deno functions that gate writes should mirror these constants inline
 * (Base44 cannot import this file).
 *
 * Letter-suffix variants (5813A Comedy Clubs, 5813B Night Clubs, 5813C
 * Restaurants - Servicing Alcohol) use the same CA/NY liquor rules as 5813.
 */

export const LIQUOR_COMPLIANCE_STATES = new Set(['CA', 'NY']);
export const LIQUOR_COMPLIANCE_MCC = '5813';
export const HIGH_RISK_ALCOHOL_PCT = 50;

/** True when MCC is 5813 or an Elavon letter variant (5813A/B/C). */
export function isLiquorComplianceMcc(mcc) {
  const base = String(mcc || '').trim().toUpperCase().replace(/[A-Z]+$/, '');
  return base === LIQUOR_COMPLIANCE_MCC;
}

export function requiresLiquorCompliance(state, mcc) {
  return LIQUOR_COMPLIANCE_STATES.has(String(state || '').trim().toUpperCase())
    && isLiquorComplianceMcc(mcc);
}

export function stateDisplayName(state) {
  const s = String(state || '').trim().toUpperCase();
  return ({ CA: 'California', NY: 'New York' })[s] || s;
}

/** Alcohol % must be a number 0–100 (inclusive) when compliance applies. */
export function isAlcoholSalesPercentageSet(value) {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

export function isHighRiskTavern(alcoholSalesPercentage) {
  const n = Number(alcoholSalesPercentage);
  return Number.isFinite(n) && n > HIGH_RISK_ALCOHOL_PCT;
}

export function liquorComplianceBannerText(state) {
  return `State Compliance Alert: Bar & Tavern accounts in ${stateDisplayName(state)} require active state liquor license verification and an audited food vs. alcohol sales breakdown to pass underwriting.`;
}
