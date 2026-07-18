/**
 * Map MSPWare / processor signing failures → which portal step to fix.
 * Shared by SigningErrorGuide (Fix buttons) and unlock navigation.
 */

export const SIGNING_FIX_STEP_ORDER = ['verify', 'locations', 'banking'];

export const SIGNING_FIELD_STEP_MAP = {
  deposit_account_no:        { label: 'Bank Account Number',            step: 'banking',   stepLabel: 'Banking Setup' },
  deposit_account_rtg:       { label: 'Bank Routing Number',            step: 'banking',   stepLabel: 'Banking Setup' },
  deposit_account_type:      { label: 'Account Type (checking/savings)', step: 'banking',  stepLabel: 'Banking Setup' },
  mcc:                       { label: 'MCC Code',                       step: 'locations', stepLabel: 'Locations & MIDs' },
  monthly_sales:             { label: 'Monthly Card Volume',            step: 'locations', stepLabel: 'Locations & MIDs' },
  average_sales:             { label: 'Average Transaction',            step: 'locations', stepLabel: 'Locations & MIDs' },
  highest_ticket:            { label: 'Highest Ticket Amount',          step: 'locations', stepLabel: 'Locations & MIDs' },
  cp_percent:                { label: 'Card-Present %',                 step: 'locations', stepLabel: 'Locations & MIDs' },
  pricing_method:            { label: 'Pricing Method',                 step: 'locations', stepLabel: 'Locations & MIDs' },
  pricing_category:          { label: 'Pricing Category',               step: 'locations', stepLabel: 'Locations & MIDs' },
  full_dba_name:             { label: 'DBA / Store Name',               step: 'locations', stepLabel: 'Locations & MIDs' },
  industry_type:             { label: 'Industry Type',                  step: 'locations', stepLabel: 'Locations & MIDs' },
  tin:                       { label: 'Federal EIN',                    step: 'locations', stepLabel: 'Business Info' },
  ownership_type:            { label: 'Business Entity Type',           step: 'locations', stepLabel: 'Business Info' },
  year_business_established: { label: 'Year Established',               step: 'locations', stepLabel: 'Business Info' },
  ownership_years:           { label: 'Years in Business',              step: 'locations', stepLabel: 'Business Info' },
  ownership_percent:         { label: 'Ownership Percentage',           step: 'verify',    stepLabel: 'Identity Verification' },
  owner_dob:                 { label: 'Owner Date of Birth',            step: 'verify',    stepLabel: 'Identity Verification' },
  owner_id_number:           { label: 'Owner SSN',                      step: 'verify',    stepLabel: 'Identity Verification' },
  owner_address:             { label: 'Owner Home Address',             step: 'verify',    stepLabel: 'Identity Verification' },
  owner_firstname:           { label: 'Owner First Name',               step: 'verify',    stepLabel: 'Identity Verification' },
  owner_lastname:            { label: 'Owner Last Name',                step: 'verify',    stepLabel: 'Identity Verification' },
  business_address:          { label: 'Business Street Address',        step: 'locations', stepLabel: 'Locations & MIDs' },
  business_city:             { label: 'Business City',                  step: 'locations', stepLabel: 'Locations & MIDs' },
  business_state_usa:        { label: 'Business State',                 step: 'locations', stepLabel: 'Locations & MIDs' },
  business_zipcode:          { label: 'Business ZIP Code',              step: 'locations', stepLabel: 'Locations & MIDs' },
};

/** Heuristic phrases → step (checked before field-key matching). */
const PHRASE_STEP_RULES = [
  { re: /ownership\s*%|ownership\s*percent|must total\s*100|sole\s*propriet/i, step: 'verify' },
  { re: /\bssn\b|social security|owner_id|date of birth|\bdob\b/i, step: 'verify' },
  { re: /deposit_account|routing|bank account/i, step: 'banking' },
  { re: /\bmcc\b|monthly_sales|highest_ticket|business_address|legal address/i, step: 'locations' },
];

const STORAGE_PREFIX = 'signing_fix_step_';

export function signingFixStepStorageKey(corporateId) {
  return `${STORAGE_PREFIX}${corporateId || 'unknown'}`;
}

export function rememberSigningFixStep(corporateId, stepKey) {
  if (!corporateId || !stepKey) return;
  try {
    sessionStorage.setItem(signingFixStepStorageKey(corporateId), stepKey);
  } catch { /* private mode */ }
}

export function readSigningFixStep(corporateId) {
  if (!corporateId) return null;
  try {
    const v = sessionStorage.getItem(signingFixStepStorageKey(corporateId));
    if (SIGNING_FIX_STEP_ORDER.includes(v)) return v;
  } catch { /* private mode */ }
  return null;
}

export function clearSigningFixStep(corporateId) {
  if (!corporateId) return;
  try {
    sessionStorage.removeItem(signingFixStepStorageKey(corporateId));
  } catch { /* private mode */ }
}

export function categorizeSigningErrors(errors) {
  const byStep = {};
  const unknown = [];
  for (const err of errors || []) {
    const raw = typeof err === 'string' ? err : (err?.message || err?.description || JSON.stringify(err));
    const phrase = PHRASE_STEP_RULES.find((r) => r.re.test(raw));
    if (phrase) {
      const meta = phrase.step === 'verify'
        ? { step: 'verify', stepLabel: 'Identity Verification', label: 'Signer / ownership details' }
        : phrase.step === 'banking'
          ? { step: 'banking', stepLabel: 'Banking Setup', label: 'Bank details' }
          : { step: 'locations', stepLabel: 'Locations & MIDs', label: 'Business / MID details' };
      if (!byStep[meta.step]) byStep[meta.step] = { stepLabel: meta.stepLabel, fields: [] };
      byStep[meta.step].fields.push({ label: meta.label, raw });
      continue;
    }
    const matched = Object.entries(SIGNING_FIELD_STEP_MAP).find(([key]) =>
      raw.toLowerCase().includes(key.toLowerCase())
    );
    if (matched) {
      const [, meta] = matched;
      if (!byStep[meta.step]) byStep[meta.step] = { stepLabel: meta.stepLabel, fields: [] };
      byStep[meta.step].fields.push({ label: meta.label, raw });
    } else {
      unknown.push(raw);
    }
  }
  return { byStep, unknown };
}

export function primarySigningFixStep(byStep, rawIssues = []) {
  for (const s of SIGNING_FIX_STEP_ORDER) {
    if (rawIssues?.some((i) => i.step === s)) return s;
    if (byStep[s]) return s;
  }
  return null;
}

/**
 * Best portal step to send the merchant after unlock / from error cards.
 * Prefers processor formErrors on the app rows, then free-text error strings.
 * @returns {'verify'|'locations'|'banking'}
 */
export function resolveSigningFixStep(applications = [], extraMessages = []) {
  const msgs = [...extraMessages];
  for (const app of applications || []) {
    if (app?.error) msgs.push(String(app.error));
    if (app?.hint) msgs.push(String(app.hint));
    for (const e of app?.formErrors || []) {
      if (e) msgs.push(typeof e === 'string' ? e : String(e?.message || e));
    }
  }
  const { byStep } = categorizeSigningErrors(msgs);
  return primarySigningFixStep(byStep, []) || 'verify';
}
