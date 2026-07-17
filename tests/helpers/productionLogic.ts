/**
 * Production decision points mirrored for stress tests.
 * Line citations point at the live source of truth — keep in sync when those
 * files change.
 */

import fs from 'node:fs';
import path from 'node:path';

// Representative portal MCC sample for stress matrix (full list: src/lib/mccCatalog.js).
// Includes Coffee (5499), Bakery (5462), Hardware variant (5251B) after 2026-07-17 catalog expand.
export const MCC_OPTIONS = [
  '5812', '5814', '5813', '5499', '5462A', '5411', '7230', '5651',
  '5734', '5311G', '7221', '5932', '4900', '5211', '5251B',
] as const;

export const RESTRICTED_MCCS = new Set(['5999']);

export const MATRIX_STATES = ['CA', 'CO', 'NY'] as const;

/**
 * Desired (not currently implemented) state × MCC underwriting flags.
 * Used by the matrix scenario to score whether the portal catches violations.
 * Source: common Elavon / ISO underwriting heuristics for alcohol / high-risk
 * retail — NOT confirmed wire codes from MSPWare. Matrix results are exploratory.
 */
export const DESIRED_RESTRICTED: Record<string, Set<string>> = {
  // Bars often need extra CA ABC / liquor underwriting
  CA: new Set(['5813']),
  // NY liquor / bar underwriting similarly elevated
  NY: new Set(['5813']),
  // CO: no extra portal-side restrictions assumed for our MCC list
  CO: new Set(),
};

/**
 * Mirrors submitToMSP / signApplication / refillMSPForms require-MCC guard
 * (2026-07-13). Returns the MCC or throws — never invents 5999.
 */
export function resolveMccForPayload(
  merchantMID: { mccCode?: string | null },
  profile: { mccCode?: string | null } = {},
): string {
  const mcc = String(merchantMID.mccCode || profile.mccCode || '').trim();
  if (!mcc) {
    throw new Error('MCC code is required before creating or filling an MSPWare application');
  }
  if (mcc === '5999') {
    throw new Error('MCC 5999 is not allowed (restricted merchant category — rejected in CA/CO/NY)');
  }
  return mcc;
}

export function uiCanSaveMid(form: { mccCode?: string; cardPresentPct?: string | number; internetPct?: string | number; motoPct?: string | number }): boolean {
  // Mirrors OnboardingLocations.jsx MidCard canSave
  const pctSum =
    (parseInt(String(form.cardPresentPct ?? 0), 10) || 0) +
    (parseInt(String(form.internetPct ?? 0), 10) || 0) +
    (parseInt(String(form.motoPct ?? 0), 10) || 0);
  return !!(form.mccCode && pctSum === 100 && form.mccCode !== '5999');
}

export function isNumericCorporateId(corporateId: string): boolean {
  return /^\d+$/.test(String(corporateId).trim());
}

export function slugifyCorporateId(raw: string): string {
  // Mirrors manageStagedApplication/entry.ts
  const slug = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'merchant';
}

export function hubspotBypassForCorporateId(corporateId: string): boolean {
  // Mirrors syncFromHubspot / getHubspotQuote / pushStatusToHubspot
  return !isNumericCorporateId(corporateId);
}

/** Soft state×MCC check the portal SHOULD run (desired). */
export function desiredStateMccViolation(state: string, mcc: string): string | null {
  const restricted = DESIRED_RESTRICTED[state];
  if (restricted?.has(mcc)) {
    return `MCC ${mcc} requires liquor compliance for state ${state}`;
  }
  return null;
}

/** Production: CA/NY + 5813 family triggers liquor compliance (alcohol % required; license post-sign). */
export function productionStateMccViolation(state: string, mcc: string): string | null {
  const base = String(mcc || '').trim().toUpperCase().replace(/[A-Z]+$/, '');
  if ((state === 'CA' || state === 'NY') && base === '5813') {
    return `MCC 5813 requires liquor compliance for state ${state} (alcohol % on MID; liquor license post-sign)`;
  }
  return null;
}

export type SourceCitation = { file: string; line: number; snippet: string };

export function citeSource(relPath: string, needle: string | RegExp): SourceCitation | null {
  const abs = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(abs)) return null;
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const re = typeof needle === 'string' ? null : needle;
  for (let i = 0; i < lines.length; i++) {
    const hit = re ? re.test(lines[i]) : lines[i].includes(needle);
    if (hit) {
      return { file: relPath.replace(/\\/g, '/'), line: i + 1, snippet: lines[i].trim() };
    }
  }
  return null;
}

export const CITATIONS = {
  // After 2026-07-13 fix: no silent `|| '5999'` — cite the require-MCC guard instead
  mccRequiredSubmit: () => citeSource('base44/functions/submitToMSP/entry.ts', 'MCC code is required'),
  mccRequiredSign: () => citeSource('base44/functions/signApplication/entry.ts', 'MCC code is required'),
  mccReject5999: () => citeSource('base44/functions/submitToMSP/entry.ts', "mcc === '5999'"),
  addMidEmptyMcc: () => citeSource('base44/functions/manageMerchantID/entry.ts', 'mccCode: data?.mccCode ||'),
  deferDraftWithoutMcc: () => citeSource('base44/functions/manageMerchantID/entry.ts', 'Skipping submitToMSP on add'),
  refillOnUpdate: () => citeSource('base44/functions/manageMerchantID/entry.ts', 'submitToMSP after update'),
  uiCanSave: () => citeSource('src/pages/OnboardingLocations.jsx', 'const canSave = form.mccCode'),
  handleAddEmpty: () => citeSource('src/pages/OnboardingLocations.jsx', "mccCode: ''"),
  hubspotBypassSync: () => citeSource('base44/functions/syncFromHubspot/entry.ts', 'hubspotBypass: true'),
  hubspotBypassPush: () => citeSource('base44/functions/pushStatusToHubspot/entry.ts', 'hubspotBypass: true'),
  signRefillGate: () => citeSource('base44/functions/signApplication/entry.ts', 'mccMismatch'),
  readinessMcc: () => citeSource('base44/functions/getMerchantData/entry.ts', "missing.push('MCC code')"),
};
