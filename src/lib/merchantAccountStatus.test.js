import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAccountStatus,
  countMids,
  isLiveMid,
  isOnboardingDeal,
  midNeedsAttention,
  latestDealActivity,
  ACCOUNT_STATUS_LABELS,
} from './merchantAccountStatus.js';

test('labels cover all statuses', () => {
  assert.equal(ACCOUNT_STATUS_LABELS.live, 'Live');
  assert.equal(ACCOUNT_STATUS_LABELS.needs_attention, 'Needs attention');
});

test('midNeedsAttention: Error and mccHelpRequested', () => {
  assert.equal(midNeedsAttention({ applicationStepStatus: 'Error' }), true);
  assert.equal(midNeedsAttention({ mccHelpRequested: true }), true);
  assert.equal(midNeedsAttention({ applicationStepStatus: 'Active' }), false);
});

test('isLiveMid', () => {
  assert.equal(isLiveMid({ applicationStepStatus: 'Active' }), true);
  assert.equal(isLiveMid({ applicationStepStatus: 'Active (Existing)' }), true);
  assert.equal(isLiveMid({ applicationStepStatus: 'Pending MID' }), false);
});

test('countMids buckets', () => {
  const c = countMids([
    { applicationStepStatus: 'Active' },
    { applicationStepStatus: 'Active (Existing)' },
    { applicationStepStatus: 'Pending MID' },
    { applicationStepStatus: 'Error' },
    { applicationStepStatus: 'In Review' },
  ]);
  assert.deepEqual(c, { total: 5, live: 2, pending: 1, error: 1, other: 1 });
});

test('priority: needs_attention beats live', () => {
  const status = deriveAccountStatus({
    deals: [{ corporateId: '1', applicationStatus: 'Submitted' }],
    mids: [
      { applicationStepStatus: 'Active' },
      { applicationStepStatus: 'Error' },
    ],
  });
  assert.equal(status, 'needs_attention');
});

test('priority: deal attention hints beat live', () => {
  const status = deriveAccountStatus({
    deals: [{ corporateId: '99', applicationStatus: 'Incomplete' }],
    mids: [{ applicationStepStatus: 'Active' }],
    dealAttention: { '99': { formIncomplete: true } },
  });
  assert.equal(status, 'needs_attention');
});

test('live when Active MID and no attention', () => {
  assert.equal(
    deriveAccountStatus({
      deals: [{ corporateId: '1', applicationStatus: 'Submitted' }],
      mids: [{ applicationStepStatus: 'Active' }],
    }),
    'live',
  );
});

test('onboarding when Incomplete deal and no live MID', () => {
  assert.equal(isOnboardingDeal({ applicationStatus: 'Incomplete' }), true);
  assert.equal(
    deriveAccountStatus({
      deals: [{ corporateId: '1', applicationStatus: 'Incomplete' }],
      mids: [{ applicationStepStatus: 'In Review' }],
    }),
    'onboarding',
  );
});

test('onboarding via handoff stage', () => {
  assert.equal(
    deriveAccountStatus({
      deals: [{ corporateId: '1', applicationStatus: 'Weird', handoffStage: 'implementation' }],
      mids: [],
    }),
    'onboarding',
  );
});

test('prospect when empty / support-only quiet', () => {
  assert.equal(deriveAccountStatus({ deals: [], mids: [] }), 'prospect');
  assert.equal(
    deriveAccountStatus({
      deals: [{ corporateId: '1', applicationStatus: 'Closed', handoffStage: 'support' }],
      mids: [],
    }),
    'prospect',
  );
});

test('latestDealActivity picks newest updated_date', () => {
  const iso = latestDealActivity([
    { updated_date: '2026-01-01T00:00:00.000Z' },
    { updated_date: '2026-07-01T00:00:00.000Z' },
  ]);
  assert.equal(iso, '2026-07-01T00:00:00.000Z');
});
