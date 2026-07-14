/**
 * Smoke checks for src/utils/pricingMapper.ts (no test runner required).
 * Run: node --experimental-strip-types scripts/verify-pricing-mapper.mjs
 * Or: npx tsx scripts/verify-pricing-mapper.mjs
 */
import assert from 'node:assert/strict';
import {
  compileAndAssertMspPricing,
  PricingIntegrityError,
  CASH_DISCOUNT_MSP_FIELDS,
  FLAT_RATE_PRESET,
} from '../src/utils/pricingMapper.ts';

function ok(label, fn) {
  try {
    fn();
    console.log('PASS', label);
  } catch (e) {
    console.error('FAIL', label, e);
    process.exitCode = 1;
  }
}

ok('CASH_DISCOUNT hardcoded schedule', () => {
  const c = compileAndAssertMspPricing({ pricingTier: 'SELF_SERVE_CASH_DISCOUNT' });
  assert.equal(c.pricing_method, 'TIERD');
  assert.equal(c.mspFields.monetary_pricing_program, CASH_DISCOUNT_MSP_FIELDS.monetary_pricing_program);
  assert.equal(c.mspFields.all_qualified_discount, '3.3816');
  assert.ok(c.snapshot.length > 10);
});

ok('FLAT_RATE preset ignores mutable fees', () => {
  const c = compileAndAssertMspPricing({
    pricingTier: 'FLAT_RATE',
    customMarkupPercentage: 99,
    customPerTxFee: 9,
    customAuthPerCard: 9,
  });
  assert.equal(c.pricing_method, 'FLAT');
  assert.equal(c.mspFields.all_markup_discount, String(FLAT_RATE_PRESET.markupPercent));
  assert.equal(c.meta.usedPreset, true);
});

ok('CUSTOM_INTERCHANGE_PLUS maps percent fees', () => {
  const c = compileAndAssertMspPricing({
    pricingTier: 'CUSTOM_INTERCHANGE_PLUS',
    customMarkupPercentage: 0.15,
    customPerTxFee: 0.05,
    customAuthPerCard: 0.03,
  });
  assert.equal(c.pricing_method, 'ICPLS');
  assert.equal(c.mspFields.all_markup_discount, '0.15');
  assert.equal(c.mspFields.all_markup_per_item, '0.05');
});

ok('basisPoints alias converts to percent', () => {
  const c = compileAndAssertMspPricing({
    pricingTier: 'CUSTOM_FLAT_RATE',
    basisPoints: 250,
    perTransactionFee: 0.1,
    customAuthPerCard: 0.1,
  });
  assert.equal(c.mspFields.all_markup_discount, '2.5');
});

ok('rejects NaN / missing custom fees', () => {
  assert.throws(
    () => compileAndAssertMspPricing({ pricingTier: 'CUSTOM_INTERCHANGE_PLUS' }),
    (e) => e instanceof PricingIntegrityError && String(e.message).includes('CRITICAL_DATA_MISMATCH'),
  );
});

ok('rejects markup above 500 bps', () => {
  assert.throws(
    () =>
      compileAndAssertMspPricing({
        pricingTier: 'CUSTOM_INTERCHANGE_PLUS',
        customMarkupPercentage: 6,
        customPerTxFee: 0.1,
        customAuthPerCard: 0.1,
      }),
    PricingIntegrityError,
  );
});

ok('locked snapshot short-circuits recalculation', () => {
  const first = compileAndAssertMspPricing({
    pricingTier: 'CUSTOM_INTERCHANGE_PLUS',
    customMarkupPercentage: 0.2,
    customPerTxFee: 0.1,
    customAuthPerCard: 0.05,
  });
  const again = compileAndAssertMspPricing({
    pricingTier: 'CUSTOM_INTERCHANGE_PLUS',
    customMarkupPercentage: 9.9, // would fail ceiling if recalculated
    customPerTxFee: 0.1,
    customAuthPerCard: 0.05,
    portalLockStatus: 'signing',
    pricingContractSnapshot: first.snapshot,
  });
  assert.equal(again.mspFields.all_markup_discount, '0.2');
});

console.log(process.exitCode ? 'DONE WITH FAILURES' : 'ALL PASS');
