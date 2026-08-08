/**
 * Canonical W-9 field object for underwriting requests.
 * Keys align with merchant edit form and PDF fill (Task 2+).
 */

export function emptyW9Fields() {
  return {
    name: '',
    businessName: '',
    taxClassification: '',
    llcTaxClass: '',
    otherClassification: '',
    exemptPayeeCode: '',
    fatcaCode: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    tinType: 'ein',
    tin: '',
    signatureName: '',
    signedAt: '',
  };
}

/**
 * Map portal ownershipType + taxClassType to W-9 federal tax classification.
 * @returns {{ taxClassification: string, llcTaxClass?: string }}
 */
export function mapOwnershipToW9TaxClass(ownershipType, taxClassType) {
  const ownership = String(ownershipType || '').toUpperCase();
  const taxClass = String(taxClassType || '').toUpperCase();

  if (ownership === 'SOLE_PROPRIETOR' || ownership === 'SOLE_PROPRIETORSHIP') {
    return { taxClassification: 'individual' };
  }

  if (ownership === 'SUB_S_CORP') {
    return { taxClassification: 's_corp' };
  }

  if (ownership === 'CORPORATION') {
    return { taxClassification: 'c_corp' };
  }

  if (ownership === 'LIMITED_COMPANY') {
    const llcTaxClass = mapLlcTaxClass(taxClass);
    return { taxClassification: 'llc', ...(llcTaxClass ? { llcTaxClass } : {}) };
  }

  if (ownership === 'GENERAL_PARTNERSHIP' || ownership === 'LIMITED_PARTNERSHIP') {
    return { taxClassification: 'partnership' };
  }

  if (ownership === 'NON_PROFIT') {
    return { taxClassification: 'other', otherClassification: 'Non-profit' };
  }

  if (ownership === 'TRUST') {
    return { taxClassification: 'trust' };
  }

  return { taxClassification: '' };
}

function mapLlcTaxClass(taxClassType) {
  switch (taxClassType) {
    case 'LLC_CORPORATION':
      return 'C';
    case 'LLC':
    case 'DISREGARDED_ENTITY':
      return 'D';
    case 'LLC_PARTNERSHIP':
      return 'P';
    default:
      return '';
  }
}

/**
 * @param {ReturnType<typeof emptyW9Fields>} fields
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateW9Fields(fields) {
  const errors = [];
  const f = fields || {};

  if (!String(f.name || '').trim()) errors.push('Name is required');
  if (!String(f.address || '').trim()) errors.push('Address is required');
  if (!String(f.city || '').trim()) errors.push('City is required');
  if (!String(f.state || '').trim()) errors.push('State is required');
  if (!String(f.zip || '').trim()) errors.push('ZIP is required');
  if (!String(f.taxClassification || '').trim()) errors.push('Tax classification is required');

  const tinDigits = String(f.tin || '').replace(/\D/g, '');
  if (!tinDigits) {
    errors.push('TIN is required');
  } else if (tinDigits.length !== 9) {
    errors.push('TIN must be 9 digits');
  }

  return { ok: errors.length === 0, errors };
}

export function extractEinDigits(federalEIN) {
  if (federalEIN == null || federalEIN === '') return '';
  return String(federalEIN).replace(/\D/g, '').slice(0, 9);
}
