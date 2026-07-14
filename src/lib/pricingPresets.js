/**
 * Agent pricing editor presets + defensive parsers.
 * Markup is stored as a percent number matching MerchantCorporateProfile.customMarkupPercentage
 * (e.g. 0.15 means 0.15% — NOT 15 basis points).
 */

export const PRICING_TEMPLATES = [
  {
    id: 'CUSTOM_INTERCHANGE_PLUS',
    label: 'Custom Interchange Plus',
    pricingTier: 'CUSTOM_INTERCHANGE_PLUS',
    requiresFees: true,
  },
  {
    id: 'FLAT_RATE_2_5',
    label: 'Flat Rate (2.5% + $0.10)',
    pricingTier: 'CUSTOM_FLAT_RATE',
    requiresFees: false,
    customMarkupPercentage: 2.5,
    customPerTxFee: 0.1,
    customAuthPerCard: 0.1,
  },
  {
    id: 'SELF_SERVE_CASH_DISCOUNT',
    label: 'Cash Discount',
    pricingTier: 'SELF_SERVE_CASH_DISCOUNT',
    requiresFees: false,
  },
];

export const TIER_LABELS = {
  CUSTOM_INTERCHANGE_PLUS: 'Custom Interchange Plus',
  CUSTOM_FLAT_RATE: 'Custom Flat Rate',
  SELF_SERVE_CASH_DISCOUNT: 'Cash Discount',
  STANDARD: 'Standard (unset)',
  TRADITIONAL: 'Traditional (unset)',
  PREMIUM: 'Premium (unset)',
};

/** Parse a numeric input; returns null for blank/invalid (never NaN). */
export function parseFeeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function formatMarkupDisplay(n) {
  const v = parseFeeNumber(n);
  if (v == null) return '—';
  return `${v}%`;
}

export function formatDollarDisplay(n) {
  const v = parseFeeNumber(n);
  if (v == null) return '—';
  return `$${v.toFixed(2)}`;
}

/** True when agent has saved a boarding-ready tier (CD or custom with all 3 fees). */
export function isPricingComplete(pricing) {
  if (!pricing) return false;
  const tier = String(pricing.pricingTier || '').toUpperCase();
  if (tier === 'SELF_SERVE_CASH_DISCOUNT') return true;
  if (tier === 'CUSTOM_FLAT_RATE' || tier === 'CUSTOM_INTERCHANGE_PLUS') {
    return (
      pricing.customMarkupPercentage != null
      && pricing.customPerTxFee != null
      && pricing.customAuthPerCard != null
    );
  }
  return false;
}

export function findTemplateByTier(pricingTier, fees = {}) {
  const tier = String(pricingTier || '').toUpperCase();
  if (tier === 'SELF_SERVE_CASH_DISCOUNT') {
    return PRICING_TEMPLATES.find(t => t.id === 'SELF_SERVE_CASH_DISCOUNT');
  }
  if (tier === 'CUSTOM_FLAT_RATE') {
    const m = parseFeeNumber(fees.customMarkupPercentage);
    const p = parseFeeNumber(fees.customPerTxFee);
    if (m === 2.5 && p === 0.1) return PRICING_TEMPLATES.find(t => t.id === 'FLAT_RATE_2_5');
    return null; // custom flat — treat as custom mode
  }
  if (tier === 'CUSTOM_INTERCHANGE_PLUS') {
    return PRICING_TEMPLATES.find(t => t.id === 'CUSTOM_INTERCHANGE_PLUS');
  }
  // Legacy STANDARD / unset — do NOT default to Interchange Plus (misleading UI).
  return null;
}
