# Review package Task 1
BASE: 99a5a1e4c4f0e1343531da47047a66654a7977c8
HEAD: 13f0f86640b7cddfe64418beef47836377150eaf

## Commits
13f0f86 feat: add Merchant Center setup status card helpers

## Stat
 src/lib/setupStatusCards.js      | 76 ++++++++++++++++++++++++++++++++++++++++
 src/lib/setupStatusCards.test.js | 54 ++++++++++++++++++++++++++++
 2 files changed, 130 insertions(+)

## Diff
```diff
diff --git a/src/lib/setupStatusCards.js b/src/lib/setupStatusCards.js
new file mode 100644
index 0000000..c8f267f
--- /dev/null
+++ b/src/lib/setupStatusCards.js
@@ -0,0 +1,76 @@
+// src/lib/setupStatusCards.js
+const QUOTE_LABELS = {
+  awaiting_signature: 'Awaiting signature',
+  awaiting_payment: 'Awaiting payment',
+  paid: 'Paid',
+};
+
+export function deriveSetupStatusCards({
+  openChecklistCount = 0,
+  merchantIDs = [],
+  locations = [],
+  quoteLifecycle = 'awaiting_signature',
+  quotePaid = false,
+  shippingStatus = 'hold',
+  trackingNumber = null,
+} = {}) {
+  const items = merchantIDs.length ? merchantIDs : locations;
+  const total = items.length;
+  const active = items.filter((i) => i.elavonMID || i.applicationStepStatus === 'Active' || i.applicationStepStatus === 'Active (Existing)').length;
+  const pending = items.filter((i) => i.applicationStepStatus === 'Pending MID').length;
+
+  let uwValue = 'No accounts yet';
+  let uwCaption = 'Processing accounts appear after submit';
+  if (total > 0) {
+    if (active === total) {
+      uwValue = 'All active';
+      uwCaption = `${total} processing account${total === 1 ? '' : 's'}`;
+    } else if (pending > 0) {
+      uwValue = 'Pending MID';
+      uwCaption = `${active} of ${total} active`;
+    } else {
+      uwValue = 'In review';
+      uwCaption = `${active} of ${total} active`;
+    }
+  }
+
+  const lifecycle = quotePaid ? 'paid' : quoteLifecycle;
+  const quoteValue = QUOTE_LABELS[lifecycle] || QUOTE_LABELS.awaiting_signature;
+
+  let shipValue = 'Locked';
+  let shipCaption = 'Unlocks after quote is paid';
+  if (shippingStatus === 'ready_to_ship' || quotePaid) {
+    shipValue = 'Ready to ship';
+    shipCaption = trackingNumber ? `Tracking: ${trackingNumber}` : 'Set shipping destination when ready';
+  } else if (lifecycle === 'awaiting_payment' || lifecycle === 'paid') {
+    shipValue = 'On hold';
+    shipCaption = 'Terminals ship after invoice is paid';
+  }
+
+  return {
+    attention: {
+      id: 'attention',
+      title: 'Needs attention',
+      value: String(openChecklistCount),
+      caption: openChecklistCount === 1 ? 'Item waiting on you' : 'Items waiting on you',
+    },
+    underwriting: {
+      id: 'underwriting',
+      title: 'Underwriting',
+      value: uwValue,
+      caption: uwCaption,
+    },
+    quote: {
+      id: 'quote',
+      title: 'Equipment quote',
+      value: quoteValue,
+      caption: 'Sign and pay to unlock shipping',
+    },
+    shipping: {
+      id: 'shipping',
+      title: 'Shipping',
+      value: shipValue,
+      caption: shipCaption,
+    },
+  };
+}
diff --git a/src/lib/setupStatusCards.test.js b/src/lib/setupStatusCards.test.js
new file mode 100644
index 0000000..ba1b967
--- /dev/null
+++ b/src/lib/setupStatusCards.test.js
@@ -0,0 +1,54 @@
+// src/lib/setupStatusCards.test.js
+import { describe, it } from 'node:test';
+import assert from 'node:assert/strict';
+import { deriveSetupStatusCards } from './setupStatusCards.js';
+
+describe('deriveSetupStatusCards', () => {
+  it('maps open checklist count to Needs attention', () => {
+    const cards = deriveSetupStatusCards({
+      openChecklistCount: 3,
+      merchantIDs: [],
+      locations: [],
+      quoteLifecycle: 'awaiting_signature',
+      quotePaid: false,
+      shippingStatus: 'hold',
+      trackingNumber: null,
+    });
+    assert.equal(cards.attention.value, '3');
+    assert.match(cards.attention.title, /attention/i);
+  });
+
+  it('summarizes underwriting from MID elavonMID / applicationStepStatus', () => {
+    const cards = deriveSetupStatusCards({
+      openChecklistCount: 0,
+      merchantIDs: [
+        { applicationStepStatus: 'In Review', elavonMID: null },
+        { applicationStepStatus: 'Active', elavonMID: '123' },
+      ],
+      locations: [],
+      quoteLifecycle: 'paid',
+      quotePaid: true,
+      shippingStatus: 'ready_to_ship',
+      trackingNumber: null,
+    });
+    assert.match(cards.underwriting.value, /1 of 2|In Review|Active/i);
+  });
+
+  it('maps quote lifecycle labels', () => {
+    const a = deriveSetupStatusCards({
+      openChecklistCount: 0, merchantIDs: [], locations: [],
+      quoteLifecycle: 'awaiting_payment', quotePaid: false,
+      shippingStatus: 'hold', trackingNumber: null,
+    });
+    assert.match(a.quote.value, /payment|Pay/i);
+
+    const b = deriveSetupStatusCards({
+      openChecklistCount: 0, merchantIDs: [], locations: [],
+      quoteLifecycle: 'paid', quotePaid: true,
+      shippingStatus: 'ready_to_ship', trackingNumber: '1Z999',
+    });
+    assert.match(b.quote.value, /Paid/i);
+    assert.match(b.shipping.value, /Ready|Ship/i);
+    assert.match(b.shipping.caption, /1Z999/);
+  });
+});
```
