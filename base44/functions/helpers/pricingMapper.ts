/**
 * Canonical Deno copy — Base44 boarding functions INLINE this (cannot import helpers). Keep in sync with src/utils/pricingMapper.ts
 *
 * Pure, testable module that compiles MSPWare pricing PUT fields from a
 * merchant pricing source (MerchantCorporateProfile — NOT StagedApplication
 * tracking metadata).
 *
 * Canonical models (switch must handle all four):
 *   Presets:  FLAT_RATE, CASH_DISCOUNT
 *   Customs:  CUSTOM_INTERCHANGE_PLUS, CUSTOM_FLAT_RATE
 *
 * Production field names (do not invent):
 *   customMarkupPercentage — percent number (0.15 = 0.15%), NOT basis points
 *   customPerTxFee, customAuthPerCard — dollars
 * Optional aliases: basisPoints (/100 → percent), perTransactionFee → customPerTxFee
 *
 * Self-serve Flat Rate remains ON HOLD (Elavon) — FLAT_RATE here is the agent
 * preset 2.5%+$0.10+$0.10 auth, stored as CUSTOM_FLAT_RATE on the profile.
 */

// ─── Canonical models ─────────────────────────────────────────────────────────

export const CANONICAL_PRICING_MODELS = [
  'FLAT_RATE',
  'CASH_DISCOUNT',
  'CUSTOM_INTERCHANGE_PLUS',
  'CUSTOM_FLAT_RATE',
] as const;

export type CanonicalPricingModel = (typeof CANONICAL_PRICING_MODELS)[number];

export const WHITELISTED_PRICING_METHODS = ['FLAT', 'ICPLS', 'TIERD'] as const;
export type WhitelistedPricingMethod = (typeof WHITELISTED_PRICING_METHODS)[number];

/** MSPWare monetary / auth program contract strings (Cash Discount schedule only). */
export const WHITELISTED_MONETARY_PROGRAMS = ['09828'] as const;
export const WHITELISTED_AUTH_PROGRAMS = ['49999'] as const;

/** Hard ceiling: 500 bps = 5.00% markup / flat rate. */
export const MAX_MARKUP_BPS = 500;
export const MAX_MARKUP_PERCENT = MAX_MARKUP_BPS / 100; // 5
export const MAX_DOLLAR_FEE = 100;

export const PRICING_LOCK_STATUSES = ['signing', 'pending_signature', 'all_signed'] as const;

// ─── Hardcoded preset constants (never read from mutable objects) ─────────────

/** Agent Flat Rate preset (2.5% + $0.10 + $0.10 auth). Template UUID/IDs unchanged. */
export const FLAT_RATE_PRESET = Object.freeze({
  markupPercent: 2.5,
  perTxFee: 0.1,
  authPerCard: 0.1,
  pricing_method: 'FLAT' as const,
});

/**
 * Cash Discount Tiered fee schedule — confirmed live 2026-07-03.
 * Absolute constants only; do not look these up from profile/env.
 */
export const CASH_DISCOUNT_MSP_FIELDS = Object.freeze({
  billing_method: 'N',
  monetary_pricing_program: '09828',
  auth_pricing_program: '49999',
  all_qualified_discount: '3.3816',
  all_qualified_per_item: '0.000',
  all_mid_qualified_discount: '3.3816',
  all_mid_qualified_per_item: '0.000',
  all_non_qualified_discount: '3.3816',
  all_non_qualified_per_item: '0.000',
  all_standard_discount: '3.3816',
  all_standard_per_item: '0.000',
  all_rewards_discount: '3.3816',
  all_rewards_per_item: '0.000',
  has_pin_debit: true,
  debit_auth_method: 'FIXED',
  debit_pricing_method: 'SURCH',
  apply_all_pin_debit: true,
  all_networks_percent_fee: '3.3816',
  all_networks_per_auth: '0',
  all_networks_transaction_fee: '0',
  pin_debit_monthly_fee: '0',
  intl_card_handling_fee: '0',
  all_card_auth_per_item: '0',
  touch_tone_auth: '0',
  avs_service_auth: '0',
  bank_referral_auth: '0',
  op_assisted_auth: '0',
});

// ─── Source types ─────────────────────────────────────────────────────────────

/**
 * Pricing source for compile. Prefer MerchantCorporateProfile fields.
 * StagedApplication.prefilledData.pricing may be passed through the same shape
 * but is never the authority for boarding (profile wins at call sites).
 */
export type PricingSource = {
  pricingTier?: string | null;
  customMarkupPercentage?: number | string | null;
  customPerTxFee?: number | string | null;
  customAuthPerCard?: number | string | null;
  /** Alias: bps → percent via /100 (e.g. 15 bps → 0.15%). Prefer customMarkupPercentage. */
  basisPoints?: number | string | null;
  /** Alias for customPerTxFee */
  perTransactionFee?: number | string | null;
  /** Accepted for integrity checks only — NOT sent on MSP PUT (no boarding wire field). */
  monthlyServiceFee?: number | string | null;
  portalLockStatus?: string | null;
  applicationStatus?: string | null;
  pricingContractSnapshot?: string | null;
  legalName?: string | null;
};

export type CompiledMspPricing = {
  model: CanonicalPricingModel;
  pricing_method: WhitelistedPricingMethod;
  /** Fields to spread into MSPWare PUT /form (pricing section only). */
  mspFields: Readonly<Record<string, string | boolean>>;
  /** Frozen JSON snapshot after pre-flight passes. */
  snapshot: string;
  meta: Readonly<{
    sourceTier: string;
    usedPreset: boolean;
    markupPercent: number | null;
    perTxFee: number | null;
    authPerCard: number | null;
    monthlyServiceFee: number | null;
  }>;
};

export class PricingIntegrityError extends Error {
  readonly code = 'CRITICAL_DATA_MISMATCH';
  readonly payloadSnapshot: string;
  constructor(message: string, payloadSnapshot: string) {
    super(`CRITICAL_DATA_MISMATCH: ${message}`);
    this.name = 'PricingIntegrityError';
    this.payloadSnapshot = payloadSnapshot;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isPricingMutationLocked(
  portalLockStatus?: string | null,
  applicationStatus?: string | null,
): boolean {
  const lock = String(portalLockStatus || '').toLowerCase();
  if ((PRICING_LOCK_STATUSES as readonly string[]).includes(lock)) return true;
  if (String(applicationStatus || '') === 'Submitted') return true;
  return false;
}

export function normalizeCanonicalModel(tierRaw: string | null | undefined): CanonicalPricingModel | null {
  const t = String(tierRaw || '').trim().toUpperCase();
  switch (t) {
    case 'FLAT_RATE':
    case 'FLAT_RATE_2_5':
      return 'FLAT_RATE';
    case 'CASH_DISCOUNT':
    case 'SELF_SERVE_CASH_DISCOUNT':
    case 'SELF_CASH_DISCOUNT':
      return 'CASH_DISCOUNT';
    case 'CUSTOM_INTERCHANGE_PLUS':
      return 'CUSTOM_INTERCHANGE_PLUS';
    case 'CUSTOM_FLAT_RATE':
      return 'CUSTOM_FLAT_RATE';
    default:
      return null;
  }
}

function finiteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Defensive percent for MSP all_markup_discount (4 decimal places). */
export function formatMarkupPercent(n: number): string {
  return Number(n.toFixed(4)).toString();
}

export function formatDollarFee(n: number): string {
  return Number(n.toFixed(4)).toString();
}

function resolveMarkupPercent(source: PricingSource): number | null {
  const fromPct = finiteNumber(source.customMarkupPercentage);
  if (fromPct != null) return fromPct;
  const bps = finiteNumber(source.basisPoints);
  if (bps != null) return Number((bps / 100).toFixed(4));
  return null;
}

function resolvePerTx(source: PricingSource): number | null {
  return finiteNumber(source.customPerTxFee) ?? finiteNumber(source.perTransactionFee);
}

function resolveAuth(source: PricingSource): number | null {
  return finiteNumber(source.customAuthPerCard);
}

function freezeCompiled(
  partial: Omit<CompiledMspPricing, 'snapshot'>,
): CompiledMspPricing {
  const snapshot = JSON.stringify({
    model: partial.model,
    pricing_method: partial.pricing_method,
    mspFields: partial.mspFields,
    meta: partial.meta,
  });
  return Object.freeze({
    ...partial,
    mspFields: Object.freeze({ ...partial.mspFields }),
    meta: Object.freeze({ ...partial.meta }),
    snapshot,
  });
}

function assertCustomFees(
  model: CanonicalPricingModel,
  markup: number | null,
  perTx: number | null,
  auth: number | null,
  name: string,
): asserts markup is number {
  if (markup == null || perTx == null || auth == null) {
    throw new PricingIntegrityError(
      `Custom pricing not yet set for "${name}" (${model}). ` +
        `customMarkupPercentage, customPerTxFee, and customAuthPerCard must ALL be set.`,
      JSON.stringify({ model, markup, perTx, auth }),
    );
  }
  if ([markup, perTx, auth].some((n) => Number.isNaN(n))) {
    throw new PricingIntegrityError(
      `NaN financial value for "${name}" (${model}).`,
      JSON.stringify({ model, markup, perTx, auth }),
    );
  }
  if (markup < 0 || perTx < 0 || auth < 0) {
    throw new PricingIntegrityError(
      `Negative fee rejected for "${name}" (${model}).`,
      JSON.stringify({ model, markup, perTx, auth }),
    );
  }
  const markupBps = Math.round(markup * 100);
  if (markupBps > MAX_MARKUP_BPS) {
    throw new PricingIntegrityError(
      `Markup ${markup}% (${markupBps} bps) exceeds hard ceiling of ${MAX_MARKUP_BPS} bps for "${name}".`,
      JSON.stringify({ model, markup, markupBps }),
    );
  }
  if (perTx > MAX_DOLLAR_FEE || auth > MAX_DOLLAR_FEE) {
    throw new PricingIntegrityError(
      `Dollar fee exceeds safety ceiling ($${MAX_DOLLAR_FEE}) for "${name}".`,
      JSON.stringify({ model, perTx, auth }),
    );
  }
}

function customMarkupFields(markup: number, perTx: number, auth: number): Record<string, string> {
  return {
    all_markup_discount: formatMarkupPercent(markup),
    all_markup_per_item: formatDollarFee(perTx),
    all_card_auth_per_item: formatDollarFee(auth),
  };
}

// ─── Compile ──────────────────────────────────────────────────────────────────

/**
 * Compile MSPWare pricing fields for a merchant pricing source.
 * Switch covers all four canonical models exhaustively.
 */
export function compileMspPricingPayload(appState: PricingSource): CompiledMspPricing {
  const name = appState.legalName || 'this merchant';
  const sourceTier = String(appState.pricingTier || '').trim().toUpperCase();

  // Idempotent target lock: when signing/locked and a validated snapshot exists,
  // never recalculate from mutable fee columns — return the frozen contract.
  if (
    isPricingMutationLocked(appState.portalLockStatus, appState.applicationStatus)
    && appState.pricingContractSnapshot
  ) {
    try {
      const parsed = JSON.parse(appState.pricingContractSnapshot) as CompiledMspPricing;
      return assertMspPricingPayload({
        ...parsed,
        snapshot: appState.pricingContractSnapshot,
      });
    } catch (e: any) {
      throw new PricingIntegrityError(
        `Locked pricingContractSnapshot failed re-validation for "${name}": ${e?.message || e}`,
        String(appState.pricingContractSnapshot),
      );
    }
  }

  const model = normalizeCanonicalModel(sourceTier);
  if (!model) {
    throw new PricingIntegrityError(
      `Pricing is not configured for "${name}" (pricingTier=${sourceTier || 'unset'}). ` +
        `Open Admin → Applications → Pricing and Save Pricing (Cash Discount or Custom).`,
      JSON.stringify({ pricingTier: sourceTier }),
    );
  }

  const monthlyServiceFee = finiteNumber(appState.monthlyServiceFee);

  switch (model) {
    case 'CASH_DISCOUNT': {
      return freezeCompiled({
        model,
        pricing_method: 'TIERD',
        mspFields: { ...CASH_DISCOUNT_MSP_FIELDS },
        meta: {
          sourceTier,
          usedPreset: true,
          markupPercent: null,
          perTxFee: null,
          authPerCard: null,
          monthlyServiceFee,
        },
      });
    }

    case 'FLAT_RATE': {
      // Hardcoded preset — do not read mutable profile fee columns.
      const { markupPercent, perTxFee, authPerCard, pricing_method } = FLAT_RATE_PRESET;
      return freezeCompiled({
        model,
        pricing_method,
        mspFields: customMarkupFields(markupPercent, perTxFee, authPerCard),
        meta: {
          sourceTier,
          usedPreset: true,
          markupPercent,
          perTxFee,
          authPerCard,
          monthlyServiceFee,
        },
      });
    }

    case 'CUSTOM_FLAT_RATE': {
      const markup = resolveMarkupPercent(appState);
      const perTx = resolvePerTx(appState);
      const auth = resolveAuth(appState);
      assertCustomFees(model, markup, perTx, auth, name);
      return freezeCompiled({
        model,
        pricing_method: 'FLAT',
        mspFields: customMarkupFields(markup, perTx!, auth!),
        meta: {
          sourceTier,
          usedPreset: false,
          markupPercent: markup,
          perTxFee: perTx,
          authPerCard: auth,
          monthlyServiceFee,
        },
      });
    }

    case 'CUSTOM_INTERCHANGE_PLUS': {
      const markup = resolveMarkupPercent(appState);
      const perTx = resolvePerTx(appState);
      const auth = resolveAuth(appState);
      assertCustomFees(model, markup, perTx, auth, name);
      return freezeCompiled({
        model,
        pricing_method: 'ICPLS',
        mspFields: customMarkupFields(markup, perTx!, auth!),
        meta: {
          sourceTier,
          usedPreset: false,
          markupPercent: markup,
          perTxFee: perTx,
          authPerCard: auth,
          monthlyServiceFee,
        },
      });
    }

    default: {
      const _exhaustive: never = model;
      throw new PricingIntegrityError(
        `Unhandled pricing model: ${String(_exhaustive)}`,
        JSON.stringify({ sourceTier }),
      );
    }
  }
}

// ─── Pre-flight runtime checks (no zod — Deno / Base44 inline copy) ───────────

function isFiniteOrNull(v: unknown): v is number | null {
  if (v === null) return true;
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Equivalent of the zod compiledSchema.safeParse — plain TypeScript runtime checks.
 * Returns an array of issue messages (empty = valid).
 */
function validateCompiledShape(
  compiled: unknown,
): string[] {
  const issues: string[] = [];
  if (compiled == null || typeof compiled !== 'object') {
    issues.push('Expected object');
    return issues;
  }
  const c = compiled as Record<string, unknown>;

  if (!(CANONICAL_PRICING_MODELS as readonly string[]).includes(c.model as string)) {
    issues.push(`Invalid enum value. Expected ${CANONICAL_PRICING_MODELS.join(' | ')}, received '${String(c.model)}'`);
  }
  if (!(WHITELISTED_PRICING_METHODS as readonly string[]).includes(c.pricing_method as string)) {
    issues.push(`Invalid enum value. Expected ${WHITELISTED_PRICING_METHODS.join(' | ')}, received '${String(c.pricing_method)}'`);
  }

  if (c.mspFields == null || typeof c.mspFields !== 'object' || Array.isArray(c.mspFields)) {
    issues.push('mspFields: Expected record');
  } else {
    for (const [key, val] of Object.entries(c.mspFields as Record<string, unknown>)) {
      if (typeof val === 'boolean') continue;
      if (typeof val === 'string' && val.length >= 1) continue;
      issues.push(`mspFields.${key}: Expected non-empty string or boolean`);
    }
  }

  if (c.snapshot !== undefined && typeof c.snapshot !== 'string') {
    issues.push('snapshot: Expected string');
  }

  if (c.meta == null || typeof c.meta !== 'object' || Array.isArray(c.meta)) {
    issues.push('meta: Expected object');
  } else {
    const m = c.meta as Record<string, unknown>;
    if (typeof m.sourceTier !== 'string') issues.push('meta.sourceTier: Expected string');
    if (typeof m.usedPreset !== 'boolean') issues.push('meta.usedPreset: Expected boolean');
    if (!isFiniteOrNull(m.markupPercent)) issues.push('meta.markupPercent: Expected finite number or null');
    if (!isFiniteOrNull(m.perTxFee)) issues.push('meta.perTxFee: Expected finite number or null');
    if (!isFiniteOrNull(m.authPerCard)) issues.push('meta.authPerCard: Expected finite number or null');
    if (!isFiniteOrNull(m.monthlyServiceFee)) issues.push('meta.monthlyServiceFee: Expected finite number or null');
  }

  return issues;
}

/**
 * Strict pre-flight: throws PricingIntegrityError (CRITICAL_DATA_MISMATCH) and
 * must halt the outbound MSPWare / BoldSign network call.
 */
export function assertMspPricingPayload(
  compiled: CompiledMspPricing | (Omit<CompiledMspPricing, 'snapshot'> & { snapshot?: string }),
): CompiledMspPricing {
  const snap = compiled.snapshot || JSON.stringify(compiled);

  const shapeIssues = validateCompiledShape(compiled);
  if (shapeIssues.length > 0) {
    throw new PricingIntegrityError(
      `Schema validation failed: ${shapeIssues.join('; ')}`,
      snap,
    );
  }

  if (!(WHITELISTED_PRICING_METHODS as readonly string[]).includes(compiled.pricing_method)) {
    throw new PricingIntegrityError(
      `pricing_method "${compiled.pricing_method}" is not on the contract whitelist.`,
      snap,
    );
  }

  for (const [key, val] of Object.entries(compiled.mspFields)) {
    if (val === null || val === undefined) {
      throw new PricingIntegrityError(`mspFields.${key} is null/undefined.`, snap);
    }
    if (typeof val === 'number' && Number.isNaN(val)) {
      throw new PricingIntegrityError(`mspFields.${key} is NaN.`, snap);
    }
    if (typeof val === 'string') {
      const asNum = Number(val);
      if (val !== '' && !Number.isNaN(asNum) && !Number.isFinite(asNum)) {
        throw new PricingIntegrityError(`mspFields.${key} is non-finite.`, snap);
      }
    }
  }

  if (compiled.model === 'CASH_DISCOUNT') {
    const mon = String(compiled.mspFields.monetary_pricing_program || '');
    const auth = String(compiled.mspFields.auth_pricing_program || '');
    if (!(WHITELISTED_MONETARY_PROGRAMS as readonly string[]).includes(mon)) {
      throw new PricingIntegrityError(
        `monetary_pricing_program "${mon}" not whitelisted.`,
        snap,
      );
    }
    if (!(WHITELISTED_AUTH_PROGRAMS as readonly string[]).includes(auth)) {
      throw new PricingIntegrityError(
        `auth_pricing_program "${auth}" not whitelisted.`,
        snap,
      );
    }
  }

  if (
    compiled.model === 'CUSTOM_INTERCHANGE_PLUS'
    || compiled.model === 'CUSTOM_FLAT_RATE'
    || compiled.model === 'FLAT_RATE'
  ) {
    for (const k of ['all_markup_discount', 'all_markup_per_item', 'all_card_auth_per_item']) {
      if (compiled.mspFields[k] == null || compiled.mspFields[k] === '') {
        throw new PricingIntegrityError(`Missing required custom field ${k}.`, snap);
      }
    }
  }

  return freezeCompiled({
    model: compiled.model,
    pricing_method: compiled.pricing_method,
    mspFields: compiled.mspFields,
    meta: compiled.meta,
  });
}

/**
 * Compile + assert. Logs CRITICAL_DATA_MISMATCH with full snapshot on failure.
 * Call immediately before MSPWare PUT /form or BoldSign package creation.
 */
export function compileAndAssertMspPricing(appState: PricingSource): CompiledMspPricing {
  try {
    const compiled = compileMspPricingPayload(appState);
    return assertMspPricingPayload(compiled);
  } catch (err: any) {
    const snapshot =
      err instanceof PricingIntegrityError
        ? err.payloadSnapshot
        : JSON.stringify({ appState, error: String(err?.message || err) });
    console.error('CRITICAL_DATA_MISMATCH', snapshot);
    if (err instanceof PricingIntegrityError) throw err;
    throw new PricingIntegrityError(String(err?.message || err), snapshot);
  }
}

/** Map profile.pricingTier for MSP method derivation (legacy aliases included). */
export function tierToPricingMethod(tierRaw: string | null | undefined): WhitelistedPricingMethod | null {
  const model = normalizeCanonicalModel(tierRaw);
  if (!model) return null;
  switch (model) {
    case 'CASH_DISCOUNT':
      return 'TIERD';
    case 'FLAT_RATE':
    case 'CUSTOM_FLAT_RATE':
      return 'FLAT';
    case 'CUSTOM_INTERCHANGE_PLUS':
      return 'ICPLS';
    default:
      return null;
  }
}
