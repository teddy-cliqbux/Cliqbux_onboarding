/**
 * Unit tests for MSP signature completion helpers.
 * Run: node --test src/lib/mspSignatureStatus.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isMspPackageFullySigned, isMspSignerSigned } from './mspSignatureStatus.js';

describe('mspSignatureStatus', () => {
  it('treats package signed:true as complete', () => {
    assert.equal(isMspPackageFullySigned({ signed: true }), true);
  });

  it('accepts Completed / complete / signed status strings (BoldSign/MSP variants)', () => {
    assert.equal(isMspPackageFullySigned({ status: 'Completed' }), true);
    assert.equal(isMspPackageFullySigned({ status: 'complete' }), true);
    assert.equal(isMspPackageFullySigned({ envelopeStatus: 'signed' }), true);
    assert.equal(isMspPackageFullySigned({ status: 'new' }), false);
  });

  it('recognizes per-signer signed rows', () => {
    assert.equal(isMspSignerSigned({ localstatus: 'Signed' }), true);
    assert.equal(isMspSignerSigned({ status: 'completed' }), true);
    assert.equal(isMspSignerSigned({ status: 'new' }), false);
  });
});
