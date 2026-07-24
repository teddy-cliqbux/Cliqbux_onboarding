/**
 * Run: node --test src/lib/signingFrameLayout.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSigningMobileShellContract,
  shouldPreferOpenSigningTab,
  PORTAL_CARD_SIGNING_OVERFLOW,
  SIGNING_IFRAME_HEIGHT_STYLE,
} from './signingFrameLayout.js';

describe('signingFrameLayout — Trisha mobile signing', () => {
  it('prefers open-in-new-tab under 768px', () => {
    assert.equal(shouldPreferOpenSigningTab(390), true);
    assert.equal(shouldPreferOpenSigningTab(767), true);
    assert.equal(shouldPreferOpenSigningTab(768), false);
    assert.equal(shouldPreferOpenSigningTab(1280), false);
  });

  it('portal signing overflow clips x only', () => {
    assert.equal(PORTAL_CARD_SIGNING_OVERFLOW, 'overflow-x-hidden');
    assert.match(String(SIGNING_IFRAME_HEIGHT_STYLE.height), /100dvh/);
  });

  it('broken shell (overflow hidden, no open link) fails contract', () => {
    const errors = assertSigningMobileShellContract({
      cardOverflowY: 'hidden',
      wrapOverflow: 'hidden',
      openVisible: false,
      viewportWidth: 390,
    });
    assert.ok(errors.length >= 2);
    assert.ok(errors.some((e) => e.includes('overflow-y')));
    assert.ok(errors.some((e) => e.includes('Open signing form')));
  });

  it('fixed shell passes contract on mobile', () => {
    const errors = assertSigningMobileShellContract({
      cardOverflowY: 'visible',
      wrapOverflow: 'visible',
      openVisible: true,
      viewportWidth: 390,
    });
    assert.deepEqual(errors, []);
  });
});
