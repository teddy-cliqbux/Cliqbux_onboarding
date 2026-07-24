// src/lib/setupStatusCards.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSetupStatusCards } from './setupStatusCards.js';

describe('deriveSetupStatusCards', () => {
  it('maps open checklist count to Needs attention', () => {
    const cards = deriveSetupStatusCards({
      openChecklistCount: 3,
      merchantIDs: [],
      locations: [],
      quoteLifecycle: 'awaiting_signature',
      quotePaid: false,
      shippingStatus: 'hold',
      trackingNumber: null,
    });
    assert.equal(cards.attention.value, '3');
    assert.match(cards.attention.title, /attention/i);
  });

  it('summarizes underwriting from MID elavonMID / applicationStepStatus', () => {
    const cards = deriveSetupStatusCards({
      openChecklistCount: 0,
      merchantIDs: [
        { applicationStepStatus: 'In Review', elavonMID: null },
        { applicationStepStatus: 'Active', elavonMID: '123' },
      ],
      locations: [],
      quoteLifecycle: 'paid',
      quotePaid: true,
      shippingStatus: 'ready_to_ship',
      trackingNumber: null,
    });
    assert.match(cards.underwriting.value, /1 of 2|In Review|Active/i);
  });

  it('maps quote lifecycle labels', () => {
    const a = deriveSetupStatusCards({
      openChecklistCount: 0, merchantIDs: [], locations: [],
      quoteLifecycle: 'awaiting_payment', quotePaid: false,
      shippingStatus: 'hold', trackingNumber: null,
    });
    assert.match(a.quote.value, /payment|Pay/i);

    const b = deriveSetupStatusCards({
      openChecklistCount: 0, merchantIDs: [], locations: [],
      quoteLifecycle: 'paid', quotePaid: true,
      shippingStatus: 'ready_to_ship', trackingNumber: '1Z999',
    });
    assert.match(b.quote.value, /Paid/i);
    assert.match(b.shipping.value, /Ready|Ship/i);
    assert.match(b.shipping.caption, /1Z999/);
  });
});
