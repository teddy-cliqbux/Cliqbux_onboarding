/**
 * Unit tests for mccToIndustry — cafe/bakery exact RS + sibling RE + family strip.
 * Run: node --test src/lib/mccToIndustry.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mccToIndustry } from './mccCatalog.js';

const RS_EXACT = [
  '5462', '5462A', '5462C',
  '5499', '5499F', '5499H', '5499K', '5499N',
];

const RE_SIBLINGS = [
  '5462B', '5462D', '5462E', '5462F', '5462G',
  '5499A', '5499B', '5499C', '5499D', '5499E', '5499G',
  '5499I', '5499J', '5499L', '5499M', '5499O', '5499P',
];

describe('mccToIndustry', () => {
  it('maps exact cafe/bakery codes to RS (no prompt path — straight RS)', () => {
    for (const mcc of RS_EXACT) {
      assert.equal(mccToIndustry(mcc), 'RS', `${mcc} → RS`);
    }
  });

  it('keeps 5462/5499 siblings on RE (no family strip)', () => {
    for (const mcc of RE_SIBLINGS) {
      assert.equal(mccToIndustry(mcc), 'RE', `${mcc} → RE`);
    }
  });

  it('still family-strips 5811–5814 to RS (e.g. 5813B Night Clubs)', () => {
    assert.equal(mccToIndustry('5811'), 'RS');
    assert.equal(mccToIndustry('5812'), 'RS');
    assert.equal(mccToIndustry('5813'), 'RS');
    assert.equal(mccToIndustry('5813B'), 'RS');
    assert.equal(mccToIndustry('5814'), 'RS');
  });

  it('maps supermarket / lodging families including letter variants', () => {
    assert.equal(mccToIndustry('5411'), 'SP');
    assert.equal(mccToIndustry('5411A'), 'SP');
    assert.equal(mccToIndustry('7011'), 'HT');
    assert.equal(mccToIndustry('7011B'), 'HT');
  });

  it('defaults non-food / other MCCs to RE', () => {
    assert.equal(mccToIndustry('5651'), 'RE');
    assert.equal(mccToIndustry('5251B'), 'RE');
    assert.equal(mccToIndustry(''), 'RE');
  });

  it('normalizes lowercase exact codes to RS', () => {
    assert.equal(mccToIndustry('5462a'), 'RS');
    assert.equal(mccToIndustry('5499k'), 'RS');
  });
});
