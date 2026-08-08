/**
 * Account-home overview helpers (best deal, primary CTA, dense summary).
 * Keep in sync with the inlined block in manageMerchantAccount/entry.ts.
 */

import { HANDOFF_STAGES } from './onboardingFacts.js';
import { isLiveMid, midNeedsAttention } from './merchantAccountStatus.js';

/** Blank / unknown handoff sorts before named stages, and before support. */
const HANDOFF_RANK = (() => {
  const map = { '': 0 };
  HANDOFF_STAGES.forEach((stage, i) => {
    map[stage] = i + 1;
  });
  return map;
})();

/**
 * @param {string|null|undefined} stage
 * @returns {number}
 */
export function handoffRank(stage) {
  const key = String(stage || '').toLowerCase().trim();
  if (!key) return 0;
  if (Object.prototype.hasOwnProperty.call(HANDOFF_RANK, key)) return HANDOFF_RANK[key];
  return HANDOFF_STAGES.length + 1;
}

/**
 * @param {object|null|undefined} deal
 * @returns {number}
 */
function dealUpdatedMs(deal) {
  const raw = deal?.updated_date || deal?.updatedAt || deal?.created_date || null;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Pick the best deal for the primary CTA.
 * Prefer earliest unfinished handoff stage; within a stage, newest activity.
 *
 * @param {Array<object>} [deals]
 * @returns {object|null}
 */
export function pickBestDeal(deals = []) {
  const list = (Array.isArray(deals) ? deals : []).filter((d) => String(d?.corporateId || '').trim());
  if (list.length === 0) return null;

  const sorted = [...list].sort((a, b) => {
    const ra = handoffRank(a?.handoffStage);
    const rb = handoffRank(b?.handoffStage);
    if (ra !== rb) return ra - rb;
    return dealUpdatedMs(b) - dealUpdatedMs(a);
  });
  return sorted[0] || null;
}

/**
 * @param {object} args
 * @param {'needs_attention'|'live'|'onboarding'|'prospect'|string} args.status
 * @param {object|null} [args.bestDeal]
 * @returns {{
 *   label: string,
 *   kind: 'deal_room'|'portal'|'locations'|'applications'|'quick_stage',
 *   corporateId: string|null,
 *   destination?: 'portal'|'locations'|'dashboard',
 * }}
 */
export function buildPrimaryCta({ status, bestDeal = null } = {}) {
  const corporateId = bestDeal ? String(bestDeal.corporateId || '').trim() || null : null;

  if (status === 'needs_attention' && corporateId) {
    return { label: 'Fix in Underwriting Room', kind: 'deal_room', corporateId };
  }
  if (status === 'onboarding' && corporateId) {
    return {
      label: 'Continue onboarding',
      kind: 'portal',
      corporateId,
      destination: 'portal',
    };
  }
  if (status === 'live' && corporateId) {
    return {
      label: 'Open locations',
      kind: 'locations',
      corporateId,
      destination: 'locations',
    };
  }
  if (status === 'prospect' && corporateId) {
    return { label: 'Open Underwriting Room', kind: 'deal_room', corporateId };
  }
  if (status === 'prospect' && !corporateId) {
    return { label: 'Start application', kind: 'quick_stage', corporateId: null };
  }

  // Fallback: deal room if we have a deal, else Applications desk
  if (corporateId) {
    return { label: 'Open Underwriting Room', kind: 'deal_room', corporateId };
  }
  return { label: 'Open Applications', kind: 'applications', corporateId: null };
}

/**
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function last4Digits(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/**
 * Prefer explicit mask; never return a full account number.
 * @param {object|null|undefined} bank
 * @returns {string|null}
 */
export function bankAccountLast4(bank) {
  if (!bank || typeof bank !== 'object') return null;
  const masked = String(bank.accountNumberMasked || '').trim();
  if (masked) {
    const fromMask = last4Digits(masked);
    if (fromMask) return fromMask;
  }
  return last4Digits(bank.accountNumber);
}

/**
 * @param {string|null|undefined} taxId
 * @returns {string|null}
 */
export function maskTaxId(taxId) {
  const digits = String(taxId || '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `•••${digits.slice(-4)}`;
}

/**
 * @param {Array<object>} [mids]
 * @returns {string|null}
 */
export function pickReportingMid(mids = []) {
  const list = Array.isArray(mids) ? mids : [];
  const live = list.find((m) => isLiveMid(m) && String(m?.elavonMID || '').trim());
  if (live) return String(live.elavonMID).trim();
  const any = list.find((m) => String(m?.elavonMID || '').trim());
  return any ? String(any.elavonMID).trim() : null;
}

/**
 * @param {Array<object>} [mids]
 * @returns {string|null}
 */
export function buildAttentionReason(mids = []) {
  const list = Array.isArray(mids) ? mids : [];
  const errors = list.filter((m) => String(m?.applicationStepStatus || '') === 'Error');
  if (errors.length === 1) {
    const name = errors[0].dbaName || errors[0].merchantName || 'A MID';
    return `${name} is in Error`;
  }
  if (errors.length > 1) return `${errors.length} MIDs are in Error`;
  const help = list.filter((m) => m?.mccHelpRequested === true);
  if (help.length === 1) {
    const name = help[0].dbaName || help[0].merchantName || 'A MID';
    return `${name} needs MCC help`;
  }
  if (help.length > 1) return `${help.length} MIDs need MCC help`;
  if (list.some(midNeedsAttention)) return 'One or more MIDs need attention';
  return null;
}

function formatMailingAddress(entity) {
  if (!entity) return null;
  const parts = [
    entity.mailingStreet,
    entity.mailingStreet2,
    [entity.mailingCity, entity.mailingState].filter(Boolean).join(', '),
    entity.mailingZip,
  ].filter((p) => String(p || '').trim());
  if (parts.length === 0) {
    const composed = String(entity.corporateMailingAddress || '').trim();
    return composed || null;
  }
  return parts.map((p) => String(p).trim()).join(', ');
}

function pickBankFromLocations(locations = [], mids = []) {
  const locList = Array.isArray(locations) ? locations : [];
  const midList = Array.isArray(mids) ? mids : [];
  for (const m of midList) {
    const bd = m?.bankDetails;
    if (bd && (bd.accountNumber || bd.accountNumberMasked || bd.routingNumber)) return bd;
  }
  for (const loc of locList) {
    const bd = loc?.bankDetails;
    if (bd && (bd.accountNumber || bd.accountNumberMasked || bd.routingNumber)) return bd;
  }
  return null;
}

function pickPhone(locations = [], deals = []) {
  for (const loc of Array.isArray(locations) ? locations : []) {
    const p = loc?.businessPhone || loc?.phone || loc?.storePhone;
    if (p) return String(p).trim();
  }
  for (const d of Array.isArray(deals) ? deals : []) {
    const p = d?.businessPhone || d?.phone;
    if (p) return String(p).trim();
  }
  return null;
}

/**
 * @param {object} args
 * @param {object} args.account
 * @param {string} args.status
 * @param {Array<object>} [args.deals]
 * @param {Array<object>} [args.locations]
 * @param {Array<object>} [args.mids]
 * @param {Array<object>} [args.legalEntities]
 */
export function buildAccountSummary({
  account = {},
  status,
  deals = [],
  locations = [],
  mids = [],
  legalEntities = null,
} = {}) {
  const entities = Array.isArray(legalEntities)
    ? legalEntities
    : Array.isArray(account.legalEntities)
      ? account.legalEntities
      : [];
  const primaryEntity = entities[0] || null;
  const bank = pickBankFromLocations(locations, mids);
  const hasLive = (Array.isArray(mids) ? mids : []).some(isLiveMid);

  return {
    contactName: account.primaryContactName || null,
    contactEmail: account.primaryContactEmail || null,
    phone: pickPhone(locations, deals),
    domain: account.domain || null,
    hubspotCompanyId: account.hubspotCompanyId || null,
    legalName: primaryEntity?.legalBusinessName || null,
    taxIdMasked: maskTaxId(primaryEntity?.federalEIN),
    taxIdType: primaryEntity?.taxIdType || null,
    mailingAddress: formatMailingAddress(primaryEntity),
    bankLast4: bankAccountLast4(bank),
    bankRoutingLast4: last4Digits(bank?.routingNumber),
    reportingMid: pickReportingMid(mids),
    flags: {
      processingLive: hasLive ? 'yes' : (Array.isArray(mids) && mids.length > 0 ? 'no' : 'unknown'),
      pci: 'unknown',
      paperlessStatements: 'unknown',
      posEnrolled: 'unknown',
    },
    attentionReason: status === 'needs_attention' ? buildAttentionReason(mids) : null,
  };
}

/**
 * @param {object} args
 * @param {object} args.account
 * @param {string} args.status
 * @param {Array<object>} [args.deals]
 * @param {Array<object>} [args.locations]
 * @param {Array<object>} [args.mids]
 */
export function buildAccountOverview({
  account = {},
  status,
  deals = [],
  locations = [],
  mids = [],
} = {}) {
  const best = pickBestDeal(deals);
  const bestDeal = best
    ? {
        corporateId: String(best.corporateId || ''),
        legalName: best.legalName || best.dbaName || null,
        handoffStage: best.handoffStage || null,
        applicationStatus: best.applicationStatus || null,
        pricingTier: best.pricingTier || null,
      }
    : null;

  return {
    bestDeal,
    primaryCta: buildPrimaryCta({ status, bestDeal }),
    summary: buildAccountSummary({
      account,
      status,
      deals,
      locations,
      mids,
      legalEntities: account.legalEntities,
    }),
  };
}
