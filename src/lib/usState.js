/**
 * Normalize US state to MSPWare 2-letter codes.
 * HubSpot company.state and some address parsers store full names ("California");
 * MSPWare rejects those on business_state_usa / owner_state_usa / legal_state_usa.
 *
 * Keep in sync with sanitizeState in:
 *   base44/functions/submitToMSP/entry.ts
 *   base44/functions/signApplication/entry.ts
 *   base44/functions/refillMSPForms/entry.ts
 */

export const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

/** Full / alternate names → 2-letter code. Territories omitted (MSPWare rejects them). */
export const US_STATE_NAME_TO_CODE = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'DISTRICT OF COLUMBIA': 'DC',
  'WASHINGTON DC': 'DC',
  'WASHINGTON D.C.': 'DC',
  'WASHINGTON D C': 'DC',
};

/**
 * @param {string} raw
 * @returns {string} 2-letter code or '' if unknown / territory
 */
export function sanitizeState(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (US_STATE_CODES.has(upper)) return upper;
  const fromName = US_STATE_NAME_TO_CODE[upper.replace(/\./g, '').replace(/\s+/g, ' ').trim()];
  if (fromName) return fromName;
  // "CA." / "ca "
  const compact = upper.replace(/[^A-Z]/g, '');
  if (compact.length === 2 && US_STATE_CODES.has(compact)) return compact;
  return '';
}
