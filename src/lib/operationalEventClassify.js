/** Pure classifiers for portal/boarding failure codes (no browser deps). */

export const BOARDING_CRITICAL_CODES = new Set([
  'CLIENT_CRASH',
  'RATE_LIMIT',
  'MSP_FORM_INCOMPLETE',
  'MSP_VALIDATION',
  'MSP_DRAFT_CREATE_FAILED',
  'SIGNING_FAILED',
  'FORMS_LOCKED',
  'HTTP_5XX_BOARDING',
]);

const BOARDING_FUNCTIONS = new Set([
  'submitToMSP',
  'signApplication',
  'refillMSPForms',
  'getMSPFormStatus',
  'manageMerchantID',
  'demoteApplication',
  'prepareMSPForms',
  'pollMSPStatus',
]);

export function classifyPortalFailure(functionName, status, errorMessage = '') {
  const msg = String(errorMessage || '').toLowerCase();
  const name = String(functionName || '');

  if (status === 429 || msg.includes('rate limit')) {
    return { severity: 'high', code: 'RATE_LIMIT' };
  }
  if (status === 423 || msg.includes('forms_locked') || msg.includes('forms locked')) {
    return { severity: 'high', code: 'FORMS_LOCKED' };
  }
  if (BOARDING_FUNCTIONS.has(name) && status >= 500) {
    return { severity: 'high', code: 'HTTP_5XX_BOARDING' };
  }
  if (name === 'signApplication' && (msg.includes('draft') || msg.includes('could not create'))) {
    return { severity: 'high', code: 'MSP_DRAFT_CREATE_FAILED' };
  }
  if (name === 'signApplication' || name === 'submitToMSP') {
    if (msg.includes('validation') || msg.includes('percent_complete') || msg.includes('incomplete')) {
      return { severity: 'high', code: 'MSP_FORM_INCOMPLETE' };
    }
    if (msg.includes('kyc_incomplete')) {
      return { severity: 'medium', code: 'KYC_INCOMPLETE' };
    }
    return { severity: 'high', code: 'SIGNING_FAILED' };
  }
  if (status >= 500) {
    return { severity: 'medium', code: 'HTTP_5XX' };
  }
  if (status >= 400) {
    return { severity: 'low', code: 'HTTP_4XX' };
  }
  return { severity: 'low', code: 'PORTAL_FUNCTION_ERROR' };
}
