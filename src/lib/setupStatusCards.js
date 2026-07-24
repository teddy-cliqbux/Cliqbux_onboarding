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
