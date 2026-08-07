import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyW9Fields,
  validateW9Fields,
  mapOwnershipToW9TaxClass,
} from './w9Model.js';

describe('emptyW9Fields', () => {
  it('returns all W-9 keys with empty defaults and ein tinType', () => {
    const fields = emptyW9Fields();
    assert.deepEqual(fields, {
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
    });
  });
});

describe('mapOwnershipToW9TaxClass', () => {
  it('maps LIMITED_COMPANY + LLC_CORPORATION to llc with C class', () => {
    const result = mapOwnershipToW9TaxClass('LIMITED_COMPANY', 'LLC_CORPORATION');
    assert.deepEqual(result, { taxClassification: 'llc', llcTaxClass: 'C' });
  });

  it('maps SOLE_PROPRIETORSHIP to individual', () => {
    const result = mapOwnershipToW9TaxClass('SOLE_PROPRIETORSHIP', 'SOLE_PROP');
    assert.deepEqual(result, { taxClassification: 'individual' });
  });

  it('maps CORPORATION to c_corp', () => {
    const result = mapOwnershipToW9TaxClass('CORPORATION', 'CORPORATION');
    assert.deepEqual(result, { taxClassification: 'c_corp' });
  });

  it('maps SUB_S_CORP to s_corp', () => {
    const result = mapOwnershipToW9TaxClass('SUB_S_CORP', 'CORPORATION');
    assert.deepEqual(result, { taxClassification: 's_corp' });
  });
});

describe('validateW9Fields', () => {
  const validBase = {
    name: 'Acme LLC',
    businessName: 'Acme LLC',
    taxClassification: 'llc',
    llcTaxClass: 'C',
    otherClassification: '',
    exemptPayeeCode: '',
    fatcaCode: '',
    address: '100 Main St',
    city: 'San Diego',
    state: 'CA',
    zip: '92101',
    tinType: 'ein',
    tin: '123456789',
    signatureName: '',
    signedAt: '',
  };

  it('passes when required fields including 9-digit EIN are present', () => {
    const result = validateW9Fields(validBase);
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
  });

  it('fails when TIN is missing', () => {
    const result = validateW9Fields({ ...validBase, tin: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /tin/i.test(e)));
  });

  it('fails when TIN is not 9 digits', () => {
    const result = validateW9Fields({ ...validBase, tin: '12345' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /tin/i.test(e)));
  });

  it('fails when name is missing', () => {
    const result = validateW9Fields({ ...validBase, name: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /name/i.test(e)));
  });

  it('fails when taxClassification is missing', () => {
    const result = validateW9Fields({ ...validBase, taxClassification: '' });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /tax classification/i.test(e)));
  });
});
