import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickBestDeal,
  buildPrimaryCta,
  buildAccountOverview,
  maskTaxId,
  bankAccountLast4,
  handoffRank,
} from './accountOverview.js';

test('handoffRank: blank before sales before support', () => {
  assert.ok(handoffRank(null) < handoffRank('sales'));
  assert.ok(handoffRank('sales') < handoffRank('underwriting'));
  assert.ok(handoffRank('installation') < handoffRank('support'));
});

test('pickBestDeal: earlier handoff wins over newer later stage', () => {
  const best = pickBestDeal([
    {
      corporateId: 'later',
      handoffStage: 'installation',
      updated_date: '2026-07-30T12:00:00.000Z',
    },
    {
      corporateId: 'earlier',
      handoffStage: 'sales',
      updated_date: '2026-07-01T12:00:00.000Z',
    },
  ]);
  assert.equal(best.corporateId, 'earlier');
});

test('pickBestDeal: within stage, newest wins', () => {
  const best = pickBestDeal([
    {
      corporateId: 'old',
      handoffStage: 'underwriting',
      updated_date: '2026-06-01T12:00:00.000Z',
    },
    {
      corporateId: 'new',
      handoffStage: 'underwriting',
      updated_date: '2026-07-20T12:00:00.000Z',
    },
  ]);
  assert.equal(best.corporateId, 'new');
});

test('CTA map by status', () => {
  const deal = { corporateId: '123', handoffStage: 'sales' };
  assert.equal(buildPrimaryCta({ status: 'needs_attention', bestDeal: deal }).kind, 'deal_room');
  assert.equal(buildPrimaryCta({ status: 'onboarding', bestDeal: deal }).kind, 'portal');
  assert.equal(buildPrimaryCta({ status: 'live', bestDeal: deal }).kind, 'locations');
  assert.equal(buildPrimaryCta({ status: 'prospect', bestDeal: deal }).kind, 'deal_room');
  assert.equal(buildPrimaryCta({ status: 'prospect', bestDeal: null }).kind, 'quick_stage');
});

test('maskTaxId and bank last4 never expose full values', () => {
  assert.equal(maskTaxId('12-3456789'), '•••6789');
  assert.equal(
    bankAccountLast4({ accountNumber: '123456789012', accountNumberMasked: '****9012' }),
    '9012',
  );
});

test('buildAccountOverview wires best deal + summary flags', () => {
  const overview = buildAccountOverview({
    account: {
      name: 'Acme',
      primaryContactEmail: 'a@b.com',
      primaryContactName: 'Ada',
      legalEntities: [{ legalBusinessName: 'Acme LLC', federalEIN: '123456789', taxIdType: 'EIN' }],
    },
    status: 'live',
    deals: [{ corporateId: '99', handoffStage: 'support', legalName: 'Acme Deal' }],
    locations: [{ bankDetails: { accountNumber: '999988887777', routingNumber: '021000021' } }],
    mids: [{ applicationStepStatus: 'Active', elavonMID: 'MID123' }],
  });
  assert.equal(overview.bestDeal.corporateId, '99');
  assert.equal(overview.primaryCta.kind, 'locations');
  assert.equal(overview.summary.reportingMid, 'MID123');
  assert.equal(overview.summary.bankLast4, '7777');
  assert.equal(overview.summary.flags.processingLive, 'yes');
  assert.equal(overview.summary.flags.pci, 'unknown');
  assert.equal(overview.summary.contactEmail, 'a@b.com');
});
