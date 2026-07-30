import test from 'node:test';
import assert from 'node:assert/strict';
import { isSsnMaskTarget } from './feedbackScreenshot.js';

function fakeEl(attrs = {}) {
  return {
    nodeType: 1,
    getAttribute(name) {
      return attrs[name] ?? null;
    },
  };
}

test('data-private=ssn is a mask target', () => {
  assert.equal(isSsnMaskTarget(fakeEl({ 'data-private': 'ssn' })), true);
});

test('name=ssn is a mask target', () => {
  assert.equal(isSsnMaskTarget(fakeEl({ name: 'ssn' })), true);
});

test('id containing ssn is a mask target', () => {
  assert.equal(isSsnMaskTarget(fakeEl({ id: 'signer-ssn-field' })), true);
});

test('bank routing is NOT a mask target', () => {
  assert.equal(isSsnMaskTarget(fakeEl({ name: 'routingNumber', id: 'routing' })), false);
});

test('ein is NOT a mask target', () => {
  assert.equal(isSsnMaskTarget(fakeEl({ name: 'federalEIN', id: 'ein' })), false);
});
