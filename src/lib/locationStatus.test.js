import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveLocationStatus,
  locationStatusLabel,
  primaryMidForLocation,
} from './locationStatus.js';

describe('deriveLocationStatus', () => {
  const loc = { id: 'L1' };

  it('returns draft when empty', () => {
    assert.equal(deriveLocationStatus(loc, []), 'draft');
  });

  it('returns live when Active MID has elavonMID', () => {
    assert.equal(
      deriveLocationStatus(loc, [
        { locationId: 'L1', applicationStepStatus: 'Active', elavonMID: '777' },
      ]),
      'live'
    );
  });

  it('returns action_needed for MCC help or errors', () => {
    assert.equal(
      deriveLocationStatus(loc, [
        { locationId: 'L1', applicationStepStatus: 'In Review', mccHelpRequested: true },
      ]),
      'action_needed'
    );
    assert.equal(
      deriveLocationStatus(loc, [
        { locationId: 'L1', applicationStepStatus: 'Error' },
      ]),
      'action_needed'
    );
  });

  it('returns in_review for Pending MID', () => {
    assert.equal(
      deriveLocationStatus(loc, [
        { locationId: 'L1', applicationStepStatus: 'Pending MID' },
      ]),
      'in_review'
    );
  });

  it('returns submitted when profile Submitted and no MIDs pending', () => {
    assert.equal(
      deriveLocationStatus(loc, [], { applicationStatus: 'Submitted' }),
      'submitted'
    );
  });

  it('returns signed when agreement signed / all_signed lock and not submitted', () => {
    assert.equal(
      deriveLocationStatus(loc, [{ locationId: 'L1', applicationStepStatus: 'Ready to Submit' }], {
        portalLockStatus: 'all_signed',
      }),
      'signed'
    );
    assert.equal(
      deriveLocationStatus(loc, [], { agreementSigned: true }),
      'signed'
    );
  });

  it('keeps draft when lock is signing but agreement not signed', () => {
    assert.equal(
      deriveLocationStatus(loc, [], { portalLockStatus: 'signing' }),
      'draft'
    );
  });
});

describe('labels and primary mid', () => {
  it('labels action_needed and signed', () => {
    assert.equal(locationStatusLabel('action_needed'), 'Action needed');
    assert.equal(locationStatusLabel('signed'), 'Signed');
  });

  it('picks live MID with elavonMID', () => {
    const mid = primaryMidForLocation(
      { id: 'L1' },
      [
        { locationId: 'L1', applicationStepStatus: 'In Review' },
        { locationId: 'L1', applicationStepStatus: 'Active', elavonMID: '99' },
      ]
    );
    assert.equal(mid.elavonMID, '99');
  });
});
