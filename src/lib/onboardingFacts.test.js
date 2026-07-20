import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogKeyToFactKey,
  nextHandoffStage,
  HANDOFF_STAGES,
  STAGE_FACT_FOCUS,
} from './onboardingFacts.js';

describe('onboardingFacts', () => {
  it('advances stages in pipeline order', () => {
    assert.equal(nextHandoffStage('sales'), 'underwriting');
    assert.equal(nextHandoffStage('underwriting'), 'implementation');
    assert.equal(nextHandoffStage('support'), null);
    assert.equal(HANDOFF_STAGES.length, 5);
  });

  it('maps catalog keys and autoRules to fact keys', () => {
    assert.equal(catalogKeyToFactKey('verify_business_hours', 'hours_present'), 'business_hours');
    assert.equal(catalogKeyToFactKey('menu_product_list', 'menu_uploaded'), 'menu');
    assert.equal(catalogKeyToFactKey('floor_plan_upload', ''), 'floor_plan');
    assert.equal(catalogKeyToFactKey('random_task', ''), null);
  });

  it('defines fact focus for implementation and installation', () => {
    assert.ok(STAGE_FACT_FOCUS.implementation.includes('tax_rates'));
    assert.ok(STAGE_FACT_FOCUS.installation.includes('client_signoff'));
  });
});
