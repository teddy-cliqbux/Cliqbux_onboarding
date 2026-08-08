import {
  emptyW9Fields,
  mapOwnershipToW9TaxClass,
  extractEinDigits,
} from './w9Model.js';

/**
 * Build best-effort W-9 prefill from legal entity (+ optional control person / location).
 * TIN comes from federalEIN digits only — never invented.
 *
 * @param {{ legalEntity: object, controlPerson?: object, locationFallback?: object }} params
 */
export function buildW9Prefill({ legalEntity, controlPerson, locationFallback } = {}) {
  const entity = legalEntity || {};
  const fields = emptyW9Fields();

  const businessName = String(entity.legalBusinessName || '').trim();
  fields.businessName = businessName;

  const ownershipType = entity.ownershipType || '';
  const taxClassType = entity.taxClassType || '';
  const taxMapping = mapOwnershipToW9TaxClass(ownershipType, taxClassType);
  fields.taxClassification = taxMapping.taxClassification || '';
  if (taxMapping.llcTaxClass) fields.llcTaxClass = taxMapping.llcTaxClass;
  if (taxMapping.otherClassification) fields.otherClassification = taxMapping.otherClassification;

  const isSoleProp =
    ownershipType === 'SOLE_PROPRIETOR' || ownershipType === 'SOLE_PROPRIETORSHIP';
  if (isSoleProp && controlPerson) {
    const first = String(controlPerson.firstName || controlPerson.firstname || '').trim();
    const last = String(controlPerson.lastName || controlPerson.lastname || '').trim();
    fields.name = [first, last].filter(Boolean).join(' ');
  } else {
    fields.name = businessName;
  }

  const mailingAddress = pickMailingAddress(entity);
  const storeAddress = pickStoreAddress(locationFallback);
  const addressSource = hasAddress(mailingAddress) ? mailingAddress : storeAddress;

  fields.address = addressSource.street;
  fields.city = addressSource.city;
  fields.state = addressSource.state;
  fields.zip = addressSource.zip;

  fields.tin = extractEinDigits(entity.federalEIN);
  fields.tinType = 'ein';

  return fields;
}

function hasAddress({ street, city, state, zip }) {
  return Boolean(street && city && state && zip);
}

function pickMailingAddress(entity) {
  const street = [entity.mailingStreet, entity.mailingStreet2].filter(Boolean).join(', ').trim();
  return {
    street,
    city: String(entity.mailingCity || '').trim(),
    state: String(entity.mailingState || '').trim(),
    zip: String(entity.mailingZip || '').trim(),
  };
}

function pickStoreAddress(location) {
  const loc = location || {};
  const street = [loc.businessStreet, loc.businessStreet2].filter(Boolean).join(', ').trim();
  return {
    street,
    city: String(loc.businessCity || '').trim(),
    state: String(loc.businessState || '').trim(),
    zip: String(loc.businessZip || '').trim(),
  };
}
