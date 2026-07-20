/**
 * Regression: MSPWare "California is not a valid option" on business_state_usa
 * (Trisha Company test 2026-07-20 — HubSpot/full-name state sent raw).
 * Run: node --test src/lib/usState.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeState } from './usState.js';

describe('sanitizeState', () => {
  it('maps full name California → CA (live MSP rejection case)', () => {
    assert.equal(sanitizeState('California'), 'CA');
    assert.equal(sanitizeState('california'), 'CA');
    assert.equal(sanitizeState(' CALIFORNIA '), 'CA');
  });

  it('passes through 2-letter codes', () => {
    assert.equal(sanitizeState('CA'), 'CA');
    assert.equal(sanitizeState('ca'), 'CA');
    assert.equal(sanitizeState('NY'), 'NY');
    assert.equal(sanitizeState('DC'), 'DC');
  });

  it('maps multi-word state names', () => {
    assert.equal(sanitizeState('New York'), 'NY');
    assert.equal(sanitizeState('new mexico'), 'NM');
    assert.equal(sanitizeState('District of Columbia'), 'DC');
  });

  it('rejects empty / unknown / territories', () => {
    assert.equal(sanitizeState(''), '');
    assert.equal(sanitizeState(null), '');
    assert.equal(sanitizeState('Guam'), '');
    assert.equal(sanitizeState('Puerto Rico'), '');
    assert.equal(sanitizeState('Narnia'), '');
  });
});
