import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPortalFailure, BOARDING_CRITICAL_CODES } from './operationalEventClassify.js';

test('rate limit → high RATE_LIMIT', () => {
  const r = classifyPortalFailure('getMerchantData', 429, 'Rate limit exceeded');
  assert.equal(r.code, 'RATE_LIMIT');
  assert.equal(r.severity, 'high');
  assert.ok(BOARDING_CRITICAL_CODES.has(r.code));
});

test('423 → FORMS_LOCKED', () => {
  const r = classifyPortalFailure('manageLegalEntity', 423, 'FORMS_LOCKED');
  assert.equal(r.code, 'FORMS_LOCKED');
  assert.equal(r.severity, 'high');
});

test('signApplication 500 → HTTP_5XX_BOARDING', () => {
  const r = classifyPortalFailure('signApplication', 500, 'boom');
  assert.equal(r.code, 'HTTP_5XX_BOARDING');
  assert.equal(r.severity, 'high');
});

test('generic 400 → low HTTP_4XX', () => {
  const r = classifyPortalFailure('listLocations', 400, 'bad request');
  assert.equal(r.code, 'HTTP_4XX');
  assert.equal(r.severity, 'low');
});
