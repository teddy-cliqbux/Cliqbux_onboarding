### Task 1: Status card helpers (TDD)

**Files:**
- Create: `src/lib/setupStatusCards.js`
- Create: `src/lib/setupStatusCards.test.js`

**Interfaces:**
- Produces:
  - `deriveSetupStatusCards({ openChecklistCount, merchantIDs, locations, quoteLifecycle, quotePaid, shippingStatus, trackingNumber })` â†’ `{ attention, underwriting, quote, shipping }`
  - Each card: `{ id, title, value, caption }` (strings)

- [ ] **Step 1: Write failing tests**

```js
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
```

- [ ] **Step 2: Run tests â€” expect FAIL**

```bash
node --test src/lib/setupStatusCards.test.js
```

Expected: FAIL â€” module not found / `deriveSetupStatusCards` undefined

- [ ] **Step 3: Implement helpers**

```js
// src/lib/setupStatusCards.js
const QUOTE_LABELS = {
  awaiting_signature: 'Awaiting signature',
  awaiting_payment: 'Awaiting payment',
  paid: 'Paid',
};

export function deriveSetupStatusCards({
  openChecklistCount = 0,
  merchantIDs = [],
  locations = [],
  quoteLifecycle = 'awaiting_signature',
  quotePaid = false,
  shippingStatus = 'hold',
  trackingNumber = null,
} = {}) {
  const items = merchantIDs.length ? merchantIDs : locations;
  const total = items.length;
  const active = items.filter((i) => i.elavonMID || i.applicationStepStatus === 'Active' || i.applicationStepStatus === 'Active (Existing)').length;
  const pending = items.filter((i) => i.applicationStepStatus === 'Pending MID').length;

  let uwValue = 'No accounts yet';
  let uwCaption = 'Processing accounts appear after submit';
  if (total > 0) {
    if (active === total) {
      uwValue = 'All active';
      uwCaption = `${total} processing account${total === 1 ? '' : 's'}`;
    } else if (pending > 0) {
      uwValue = 'Pending MID';
      uwCaption = `${active} of ${total} active`;
    } else {
      uwValue = 'In review';
      uwCaption = `${active} of ${total} active`;
    }
  }

  const lifecycle = quotePaid ? 'paid' : quoteLifecycle;
  const quoteValue = QUOTE_LABELS[lifecycle] || QUOTE_LABELS.awaiting_signature;

  let shipValue = 'Locked';
  let shipCaption = 'Unlocks after quote is paid';
  if (shippingStatus === 'ready_to_ship' || quotePaid) {
    shipValue = 'Ready to ship';
    shipCaption = trackingNumber ? `Tracking: ${trackingNumber}` : 'Set shipping destination when ready';
  } else if (lifecycle === 'awaiting_payment' || lifecycle === 'paid') {
    shipValue = 'On hold';
    shipCaption = 'Terminals ship after invoice is paid';
  }

  return {
    attention: {
      id: 'attention',
      title: 'Needs attention',
      value: String(openChecklistCount),
      caption: openChecklistCount === 1 ? 'Item waiting on you' : 'Items waiting on you',
    },
    underwriting: {
      id: 'underwriting',
      title: 'Underwriting',
      value: uwValue,
      caption: uwCaption,
    },
    quote: {
      id: 'quote',
      title: 'Equipment quote',
      value: quoteValue,
      caption: 'Sign and pay to unlock shipping',
    },
    shipping: {
      id: 'shipping',
      title: 'Shipping',
      value: shipValue,
      caption: shipCaption,
    },
  };
}
```

- [ ] **Step 4: Run tests â€” expect PASS**

```bash
node --test src/lib/setupStatusCards.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Stage for commit (when Teddy asks)**

```bash
git add src/lib/setupStatusCards.js src/lib/setupStatusCards.test.js
# commit only if Teddy requests: feat: add Merchant Center setup status card helpers
```

---


