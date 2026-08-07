import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildW9Prefill } from './w9Prefill.js';

describe('buildW9Prefill', () => {
  it('prefers entity mailing address over location fallback', () => {
    const fields = buildW9Prefill({
      legalEntity: {
        legalBusinessName: 'Acme LLC',
        ownershipType: 'LIMITED_COMPANY',
        taxClassType: 'LLC_CORPORATION',
        federalEIN: '12-3456789',
        mailingStreet: '200 Legal Ave',
        mailingCity: 'Los Angeles',
        mailingState: 'CA',
        mailingZip: '90001',
      },
      locationFallback: {
        businessStreet: '100 Store St',
        businessCity: 'San Diego',
        businessState: 'CA',
        businessZip: '92101',
      },
    });

    assert.equal(fields.address, '200 Legal Ave');
    assert.equal(fields.city, 'Los Angeles');
    assert.equal(fields.state, 'CA');
    assert.equal(fields.zip, '90001');
  });

  it('uses location fallback when entity has no mailing address', () => {
    const fields = buildW9Prefill({
      legalEntity: {
        legalBusinessName: 'Acme LLC',
        ownershipType: 'CORPORATION',
        taxClassType: 'CORPORATION',
        federalEIN: '98-7654321',
      },
      locationFallback: {
        businessStreet: '100 Store St',
        businessCity: 'San Diego',
        businessState: 'CA',
        businessZip: '92101',
      },
    });

    assert.equal(fields.address, '100 Store St');
    assert.equal(fields.city, 'San Diego');
    assert.equal(fields.state, 'CA');
    assert.equal(fields.zip, '92101');
  });

  it('extracts TIN digits from federalEIN only and never invents', () => {
    const withEin = buildW9Prefill({
      legalEntity: {
        legalBusinessName: 'Acme LLC',
        ownershipType: 'CORPORATION',
        taxClassType: 'CORPORATION',
        federalEIN: '12-3456789',
      },
    });
    assert.equal(withEin.tin, '123456789');
    assert.equal(withEin.tinType, 'ein');

    const withoutEin = buildW9Prefill({
      legalEntity: {
        legalBusinessName: 'Acme LLC',
        ownershipType: 'CORPORATION',
        taxClassType: 'CORPORATION',
      },
    });
    assert.equal(withoutEin.tin, '');
    assert.equal(withoutEin.tinType, 'ein');
  });

  it('uses control person name for sole proprietorship', () => {
    const fields = buildW9Prefill({
      legalEntity: {
        legalBusinessName: 'Jane Doe DBA',
        ownershipType: 'SOLE_PROPRIETORSHIP',
        taxClassType: 'SOLE_PROP',
        federalEIN: '111223333',
      },
      controlPerson: {
        firstName: 'Jane',
        lastName: 'Doe',
      },
    });

    assert.equal(fields.taxClassification, 'individual');
    assert.equal(fields.name, 'Jane Doe');
    assert.equal(fields.businessName, 'Jane Doe DBA');
  });
});
