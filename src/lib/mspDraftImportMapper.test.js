/**
 * Run: node --test src/lib/mspDraftImportMapper.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapMspFormToPortal } from './mspDraftImportMapper.js';

const SAMPLE_FORM = {
  legal_dba_name: 'KK House of Lechon LLC',
  full_dba_name: 'KK House of Lechon and BBQ',
  tin: '123456789',
  ownership_type: 'LL',
  llc_class: 'C',
  year_business_established: '2019',
  products_or_services: 'Filipino BBQ and lechon',
  business_address: '100 Main St',
  business_city: 'San Diego',
  business_state_usa: 'CA',
  business_zipcode: '92101',
  business_phone: '6195550100',
  business_email: 'kate@example.com',
  mcc: '5812',
  industry_type: 'RS',
  pricing_category: '7',
  monthly_sales: '50000',
  average_sales: '45',
  highest_ticket: '200',
  cp_percent: '80',
  int_percent: '10',
  cnp_percent: '10',
  business_homepage_url: 'https://kklechon.example',
  deposit_account_rtg: '122000247',
  deposit_account_no: '9876543210',
  deposit_account_type: 'CK',
  owners: [
    {
      owner_firstname: 'Kate',
      owner_lastname: 'D',
      owner_email: 'kate@example.com',
      owner_ownership: '100',
      owner_title: 'MM',
      owner_dob: '1985-04-12',
      owner_address: '200 Home Ave',
      owner_city: 'San Diego',
      owner_state_usa: 'CA',
      owner_zipcode: '92102',
      principal_sign_agreement: true,
    },
  ],
};

describe('mapMspFormToPortal', () => {
  it('forces Cash Discount pricing and omits mspApplicationNo', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM);
    assert.equal(m.profile.pricingTier, 'SELF_SERVE_CASH_DISCOUNT');
    assert.equal(m.mid.pricingMethod, 'TIERD');
    assert.equal(m.mid.mspApplicationNo, undefined);
    assert.equal(m.mid.isExistingAccount, false);
  });

  it('maps Omni split: int→internetPct, cnp→motoPct', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM);
    assert.equal(m.mid.cardPresentPct, 80);
    assert.equal(m.mid.internetPct, 10);
    assert.equal(m.mid.motoPct, 10);
  });

  it('maps ownership LL + llc_class C → LIMITED_COMPANY + LLC_CORPORATION', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM);
    assert.equal(m.profile.ownershipType, 'LIMITED_COMPANY');
    assert.equal(m.profile.taxClassType, 'LLC_CORPORATION');
    assert.equal(m.legalEntity.federalEIN, '123456789');
  });

  it('marks Kate as Control Person when first name matches', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM, { controlPersonFirstName: 'Kate' });
    assert.equal(m.signers[0].isAuthorizedSigner, true);
    assert.equal(m.signers[0].isPrimarySigner, true);
  });

  it('masks TIN in preview and lists bank when present', () => {
    const m = mapMspFormToPortal(SAMPLE_FORM);
    assert.equal(m.preview.tinLast4, '6789');
    assert.equal(m.preview.hasBank, true);
    assert.equal(m.location.bankDetails.routingNumber, '122000247');
    assert.equal(m.location.bankDetails.accountType, 'checking');
  });

  it('never treats 5999 as a valid default MCC when form mcc empty', () => {
    const m = mapMspFormToPortal({ ...SAMPLE_FORM, mcc: '' });
    assert.equal(m.mid.mccCode, '');
    assert.ok(m.gaps.some((g) => /mcc/i.test(g)));
  });

  it('clears 5999 from MID and preview and records invalid-MCC gap', () => {
    const m = mapMspFormToPortal({ ...SAMPLE_FORM, mcc: '5999' });
    assert.equal(m.mid.mccCode, '');
    assert.notEqual(m.preview.mcc, '5999');
    assert.equal(m.preview.mcc, null);
    assert.ok(m.gaps.some((g) => /5999|invalid/i.test(g)));
  });
});
