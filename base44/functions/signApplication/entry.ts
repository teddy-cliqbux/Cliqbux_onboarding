import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-10j — cnp_percent is now the RESIDUAL of the four MSPWare acceptance buckets (was 100−cp, double-counting int/moto → processor rejected cnp_percent:100 on app #210)
// redeployed 2026-07-10i — card-split fields (internetPct/motoPct) sourced from MerchantMID, parseInt(cardPresentPct) no longer forces 0→100, PUT-response validation errors take priority over GET rollback noise

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
// getPortalActor returns { actor: 'merchant', corporateId } when the request
// carries a valid merchant JWT (issued by validateResumeToken, createHubspotDeal,
// or manageStagedApplication 'validate'), { actor: 'admin' } when it carries a
// Base44 workspace session, or null when neither. Callers must 401 on null and
// enforce corporateId match for merchant actors.
function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getPortalActor(req: Request, base44: any): Promise<{ actor: 'merchant' | 'admin'; corporateId?: string } | null> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify('HMAC', key, __b64uDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (ok) {
        const payload = JSON.parse(new TextDecoder().decode(__b64uDecode(parts[1])));
        if (payload.corporateId && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000) {
          return { actor: 'merchant', corporateId: String(payload.corporateId) };
        }
      }
    }
  } catch { /* invalid merchant token — fall through to workspace check */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no workspace session */ }
  return null;
}


// ─── signApplication ──────────────────────────────────────────────────────────
// Packages ALL pending MSPWare applications for a corporateId for e-signature
// and returns signing URLs per merchantMID, in order.
//
// Flow:
//   1. Load profile, signers, merchantMIDs, AND locations
//   2. Filter to signable merchantMIDs (have mspApplicationNo, not already Active)
//   3. If none signable, auto-create MSPWare draft applications for unsubmitted merchantMIDs
//   4. For each signable: GET /signatures → create package if needed → GET /signatures/link
//   5. Return ordered array of applications with signing URLs + overall state
//
// The UI uses this to show iframes sequentially — one agreement per merchantMID.
// Poll by calling again with the same corporateId; allSigned flips true when done.
//
// POST /functions/signApplication
// Body: { corporateId }

// ─── Constants (shared with submitToMSP) ─────────────────────────────────────
// Cliqbux's 4-template pricing model — see AGENTS.md Critical Lesson #12.
const MSP_APP_TYPE = 24;           // Elavon US Application
// 2026-07-09: switched from #6 to #209 ('Custom InterchangePlus Template') — see submitToMSP.
const DEFAULT_TEMPLATE_NO = 209;  // Custom InterchangePlus Template
// 2026-07-07: CD_TEMPLATE_NO switched from 154 to 133. #154 ("Cliqbux Template Cash
// Discount") was missing key data and is no longer used for anything. #133 ("Cash
// Discount Template") is the new standard — a properly MSPWare-typed Template record
// with fields confirmed by Teddy. See AGENTS.md.
const CD_TEMPLATE_NO = 133;       // Cash Discount Template — Self-Serve Cash Discount
const FLAT_TEMPLATE_NO = 0;       // TODO: Custom Flat Rate — fill in once created (see submitToMSP)
const DEFAULT_SALESPERSON_ID = 0;
// Self-Serve Flat Rate has NO template — on hold, Elavon doesn't support it yet.
const TIER_TO_TEMPLATE: Record<string, number> = {
  'CUSTOM_FLAT_RATE': FLAT_TEMPLATE_NO,
  'CUSTOM_INTERCHANGE_PLUS': DEFAULT_TEMPLATE_NO,
  'SELF_SERVE_CASH_DISCOUNT': CD_TEMPLATE_NO,
  'TRADITIONAL': DEFAULT_TEMPLATE_NO, 'STANDARD': DEFAULT_TEMPLATE_NO, 'PREMIUM': DEFAULT_TEMPLATE_NO,
  'CASH_DISCOUNT': CD_TEMPLATE_NO, 'SELF_CASH_DISCOUNT': CD_TEMPLATE_NO,
  'SELF_SWIPED': DEFAULT_TEMPLATE_NO, 'SELF_KEYED': DEFAULT_TEMPLATE_NO,
};
// Pricing tiers that are ALWAYS a custom, individually-negotiated deal — no
// off-the-shelf template. See Critical Lesson #12.
const CUSTOM_PRICING_TIERS = ['CUSTOM_FLAT_RATE', 'CUSTOM_INTERCHANGE_PLUS', 'TRADITIONAL', 'STANDARD', 'PREMIUM'];

// ─── Helpers (mirrored from submitToMSP) ─────────────────────────────────────

function mapOwnershipType(t: string): string {
  const map: Record<string, string> = {
    'SOLE_PROP':        'SP', 'SOLE_PROPRIETOR':  'SP',
    'LLC':              'LL', 'LLC_CORPORATION':  'LL', 'LLC_PARTNERSHIP':  'LL',
    'CORPORATION':      'CO', 'C_CORP':           'CO',
    'S_CORP':           'SS', 'SUB_S_CORP':       'SS',
    'PARTNERSHIP':      'PA', 'LIMITED_COMPANY':  'LL',
    'NON_PROFIT':       'NP', 'TRUST':            'T',
    // BUG FIXED 2026-07-03: our own frontend's Business Entity Type dropdown
    // (OWNERSHIP_TYPES in OnboardingLocations.jsx) uses 'GENERAL_PARTNERSHIP'
    // and 'LIMITED_PARTNERSHIP' as values — neither matched any key here, so
    // both silently fell through to the 'CO' (Corporation) default instead of
    // 'PA' (Partnership). Confirmed by comparing our dropdown against MSPWare's
    // own Ownership Type field live.
    'GENERAL_PARTNERSHIP': 'PA', 'LIMITED_PARTNERSHIP': 'PA',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'CO';
}

function mapLlcClass(t: string): string {
  const map: Record<string, string> = {
    'LLC': 'D', 'LLC_PARTNERSHIP': 'P', 'LLC_CORPORATION': 'C',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'D';
}

function mapOwnerTitle(t: string): string {
  const map: Record<string, string> = {
    'CHIEF_EXECUTIVE_OFFICER': 'CEO',
    'CHIEF_FINANCIAL_OFFICER':  'CFO',
    'PRESIDENT':                'P',
    'VICE_PRESIDENT':           'VP',
    'DIRECTOR':                 'D',
    'SECRETARY':                'S',
    'TREASURER':                'T',
    'MANAGING_MEMBER':          'MM',
    'AUTHORIZED_SIGNER':        'OP',
    'OWNER':                    'OP',
    'PROPRIETOR_OR_OWNER':      'OP',
    'PARTNER':                  'PP',
    'PARTNER_OR_PRINCIPAL':     'PP',
    'MANAGER':                  'GM',
    'GENERAL_MANAGER':          'GM',
    'CEO': 'CEO', 'CFO': 'CFO', 'COO': 'COO',
    'VP': 'VP', 'MM': 'MM',
  };
  return map[t] || map[t?.toUpperCase?.()] || 'OP';
}

function mapIndustryType(pricingCategory: string): string {
  const map: Record<string, string> = {
    '1': 'RE', '2': 'HT', '4': 'SP', '5': 'ARU', '6': 'MS', '7': 'RS', '13': 'RE',
  };
  return map[pricingCategory] || 'RE';
}

// Reverse of mapIndustryType — used to derive pricingCategory from an explicitly
// chosen industryType when pricingCategory itself was never set. The current MID
// editor UI only exposes "MCC Code" + "Industry Type" (no Pricing Category field),
// so pricingCategory is frequently null even when industryType is correctly set.
const INDUSTRY_TO_CATEGORY: Record<string, string> = {
  'RE': '1', 'HT': '2', 'SP': '4', 'ARU': '5', 'MS': '6', 'RS': '7',
};

function industryClassToMSP(cls: string): string {
  const map: Record<string, string> = {
    'RESTAURANT': 'RS', 'GROCERY': 'SP', 'HOTEL': 'HT', 'ECOMMERCE': 'MS',
    'SERVICES': 'RE', 'RETAIL': 'RE', 'AUTO': 'RE', 'HEALTH': 'RE',
    'SALON': 'RE', 'GYM': 'RE', 'BAR': 'RS', 'CLOTHING': 'RE',
    'ELECTRONICS': 'RE', 'FURNITURE': 'RE',
  };
  return map[cls] || 'RE';
}

function cleanDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

// Strips SSN and bank account/routing numbers before logging — recurses into
// arrays (e.g. owners[]) so additional-owner SSNs are caught too.
const SENSITIVE_LOG_KEYS = new Set(['owner_id_number', 'ssn', 'deposit_account_no', 'deposit_account_rtg']);
function redactSensitive(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  if (obj && typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj as Record<string, any>)) {
      out[k] = SENSITIVE_LOG_KEYS.has(k) ? '[REDACTED]' : redactSensitive(v);
    }
    return out;
  }
  return obj;
}

function resolveLocationAddress(location: Record<string, any>): Record<string, any> {
  if (location.businessStreet && location.businessCity && location.businessState) return location;
  const flat = location.businessAddress || '';
  const m = flat.match(/^(.+?),\s*(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (!m) return location;
  return {
    ...location,
    businessStreet: location.businessStreet || m[1].trim(),
    businessCity:   location.businessCity   || m[2].trim(),
    businessState:  location.businessState  || m[3].toUpperCase(),
    businessZip:    location.businessZip    || m[4].trim(),
  };
}

const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
function sanitizeState(s: string): string {
  const code = (s || '').toUpperCase().trim();
  return US_STATES.has(code) ? code : '';
}

function formatDob(year: string, month: string, day: string): string {
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Form Payload Builder ─────────────────────────────────────────────────────
//
// STRICT TEMPLATE PRESERVATION RULE — READ BEFORE EDITING
// =========================================================
// MSPWare templates (#6 ICPLS, #154 Cash Discount) pre-fill a large set of
// fee schedule, equipment, and account configuration fields. Sending ANY of
// those fields in a PUT /form payload OVERWRITES the template value — even
// if you send the same value the template already has. This causes form
// completion to drop below 100%, blocking signing.
//
// This function sends ONLY merchant-specific fields. The following are
// intentionally OMITTED for ICPLS (non-Cash-Discount) merchants because the
// template owns them:
//
//   billing_method, billing_frequency, funding_type, monetary_code, statement_type,
//   monthly_minimum_fee, chargeback_fee, account_maintenance_fee, rtp_monthly_fee,
//   touch_tone_auth, avs_service_auth, bank_referral_auth, op_assisted_auth,
//   C4_surcharging_cardholder_surcharge, tokenization_service_fee,
//   tokenization_platform_fee, tokenization_sharing_indicator,
//   has_pin_debit, debit_auth_method, debit_pricing_method,
//   all per-network debit interchange fee fields (ACCL_*, AFFN_*, ALAS_*, CU24_*,
//   INKL_*, MSTO_*, NETS_*, NYCE_*, POSD_*, PULSE_*, ITS_*, STAR_*, UPDBT_*),
//   fixed_individual_tiers_pricing, multi_currency_conversion, secure3d,
//   all_markup_discount, all_markup_per_item, all_card_auth_per_item,
//   intl_card_handling_fee, auth_pricing_program, annual_fee_start_date,
//   is_firearm_verified (CRITICAL: every value is rejected by the API; omit always
//   — this is a template-level default that needs fixing directly on templates
//   #6/#154 in MSPWare, not something this function can send. See AGENTS.md.
//   2026-07-03: Teddy confirmed this field only appears/is required for certain
//   business address states; when it appears the correct answer is "No", but it
//   must be fixed on the template, never sent via payload.)
//
// If you need to add a new field, verify it is NOT in the template by reading
// GET /applications/154/form before adding it here.
//
// EXCEPTION 1 — Cliqbux Program Configuration fields (entity_number, safet_service,
// safet_fee, tokenization): these look like template-owned config but are actually
// Cliqbux business/reseller settings that no template can supply per-merchant. See
// the "Cliqbux Program Configuration" block below for the confirmed values and why.
// `tokenization: 'none'` is sent for ALL merchants (not just Cash Discount) —
// confirmed by Teddy 2026-07-03: "No tokenization is available to us now." This
// also means `tokenization_platform_fee`/`tokenization_service_fee` are moot and
// stay omitted.
//
// EXCEPTION 2 — Cash Discount (pricing_method: 'TIERD') fee schedule: Cliqbux
// NEVER uses MSPWare's "Clear and Simple" pricing method (confirmed by Teddy
// 2026-07-03 — "We do not use clear and simple for pricing method ever. Tiered
// only."). Because template #154 was built around Clear and Simple, its Tiered-
// method fields aren't reliable, so for Cash Discount merchants ONLY,
// buildFormPayload explicitly sends the flat-rate fee schedule (billing_method,
// auth_pricing_program, monetary_pricing_program, all_*_discount/per_item tiers,
// debit fields, touch_tone_auth/avs_service_auth/bank_referral_auth/op_assisted_auth,
// intl_card_handling_fee) instead of omitting them. ICPLS merchants are NOT
// affected. See the "Cliqbux Cash Discount Fee Schedule" block below and
// docs/mspware-field-reference.md.

function buildFormPayload(
  profile: Record<string, any>,
  location: Record<string, any>,
  merchantMID: Record<string, any>,
  primarySigner: Record<string, any>,
  additionalSigners: Record<string, any>[],
  entityMailing?: { street: string; city: string; state: string; zip: string } | null
): Record<string, unknown> {
  const signer = primarySigner || {};
  const bank = merchantMID.bankDetails || location.bankDetails || {};
  const routing = bank.routingNumber || location.routingNumber || '';
  const account = bank.accountNumber || location.accountNumber || '';
  // profile.taxId is a flat field the self-serve flow never actually populates —
  // the merchant's EIN is instead captured per-entity under profile.legalEntities[].federalEIN.
  // Match the entity tied to this location; fall back to the first entity if unmatched.
  const matchedEntity = (profile.legalEntities || []).find((e: any) => e.entityId === location.entityId) || profile.legalEntities?.[0];
  const taxId = cleanDigits(profile.taxId || matchedEntity?.federalEIN || '');
  const ssn = cleanDigits(signer.ssn || profile.ssn || '');
  const phone = cleanDigits(signer.corporatePhone || profile.corporatePhone || '');
  // BUG FIXED 2026-07-03: previously required BOTH pricingCategory AND industryType
  // to be set on merchantMID before trusting the explicit industryType — but the
  // current MID editor UI only exposes "MCC Code" + "Industry Type" (no Pricing
  // Category field), so pricingCategory is normally null even when industryType
  // is correctly chosen (e.g. "Restaurant (RS)"). That silently discarded the
  // merchant's real industry and always fell back to Retail. Now: trust an
  // explicit industryType directly, and derive pricingCategory FROM it (via
  // INDUSTRY_TO_CATEGORY) when pricingCategory itself was never set.
  const pricingCategory = String(
    merchantMID.pricingCategory || profile.pricingCategory
    || (merchantMID.industryType && INDUSTRY_TO_CATEGORY[merchantMID.industryType])
    || '1'
  );
  // Map pricingTier (UI enum) → MSPWare pricing_method when pricingMethod isn't set directly
  // 2026-07-03: Teddy confirmed Cliqbux never uses MSPWare's "Clear and Simple"
  // pricing method — every Cash Discount plan uses "Tiered" (wire value TIERD)
  // instead, with a flat-rate fee schedule sent explicitly in buildFormPayload.
  // See docs/mspware-field-reference.md.
  const TIER_TO_METHOD: Record<string, string> = {
    'CUSTOM_FLAT_RATE': 'FLAT',
    'CUSTOM_INTERCHANGE_PLUS': 'ICPLS',
    'SELF_SERVE_CASH_DISCOUNT': 'TIERD',
    // Legacy values — kept mapped for historical/in-flight records. Do not use for
    // new merchants. See AGENTS.md Critical Lesson #12.
    'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS',
    'CASH_DISCOUNT': 'TIERD', 'SELF_CASH_DISCOUNT': 'TIERD',
    // ON HOLD — Elavon doesn't support self-serve flat rate yet. See Lesson #12.
    'SELF_SWIPED': 'ICPLS', 'SELF_KEYED': 'ICPLS',
  };
  const rawPricingMethod = merchantMID.pricingMethod || profile.pricingMethod
    || TIER_TO_METHOD[(merchantMID.pricingTier || profile.pricingTier || '').toUpperCase()]
    || 'ICPLS';
  const pricingMethod = rawPricingMethod.toUpperCase() === 'CASH_DISCOUNT' ? 'TIERD' : rawPricingMethod;

  // GUARD (2026-07-06): Custom Flat Rate / Custom Interchange Plus are always
  // individually-negotiated deals — refuse to build a payload until the merchant's
  // real negotiated numbers are captured. See AGENTS.md Critical Lesson #12.
  const tierKey = (merchantMID.pricingTier || profile.pricingTier || '').toUpperCase();
  const isCustomPricingTier = CUSTOM_PRICING_TIERS.includes(tierKey);
  if (isCustomPricingTier && (profile.customMarkupPercentage == null || profile.customPerTxFee == null || profile.customAuthPerCard == null)) {
    throw new Error(
      `Custom pricing not yet set for "${profile.legalName || 'this merchant'}" (pricingTier=${tierKey}). ` +
      `customMarkupPercentage, customPerTxFee, and customAuthPerCard must ALL be set before an MSPWare ` +
      `application can be created or filled for a custom-pricing tier. (These come from the HubSpot deal: ` +
      `processing_pricing_tier + custom_markup_percentage + custom_per_tx_fee + custom_auth_per_card.)`
    );
  }

  const industryType = merchantMID.industryType || mapIndustryType(pricingCategory);
  const mcc = merchantMID.mccCode || profile.mccCode || '5999';
  const dbaName = merchantMID.dbaName || location.dbaName || profile.legalName || '';
  const monthlyCardSales = Math.max(1, parseFloat(String(merchantMID.monthlyCardSales || profile.monthlyCardSales || '6000')) || 6000);
  const rawAvg = parseFloat(String(merchantMID.avgSaleAmount || profile.avgSaleAmount || '100')) || 100;
  const rawHighest = parseFloat(String(merchantMID.highestTicketAmount || profile.highestTicketAmount || '200')) || 200;
  // MSPWare rules:
  // 1. average_sales must be LESS THAN monthly_sales
  // 2. highest_ticket must be GREATER THAN OR EQUAL TO average_sales (and less than monthly_sales)
  const cap = Math.max(monthlyCardSales - 1, 1);
  const avgSaleAmount = String(Math.min(rawAvg, cap));
  // highest_ticket must be STRICTLY GREATER THAN average_sales AND less than monthly_sales
  const minHighest = Math.min(rawAvg, cap) + 1; // at least 1 more than average
  const highestTicketAmount = String(Math.min(Math.max(rawHighest, minHighest), cap));
  // MSPWare rule: delayed_delivery must be >= 1
  const rawDelay = parseInt(String(merchantMID.deliveryDelayDays ?? profile.deliveryDelayDays ?? '0'), 10);
  const deliveryDelayDays = String(Math.max(rawDelay, 1));
  // cardPresentPct: treat null/undefined as 100 (in-person default), NOT 0
  const rawCpPct = merchantMID.cardPresentPct != null ? merchantMID.cardPresentPct : (profile.cardPresentPct != null ? profile.cardPresentPct : 100);
  // NOTE: || 100 here previously turned a legitimate 0% card-present into 100%
  // (0 is falsy) — only default when the value is genuinely absent/NaN.
  const parsedCpPct = parseInt(String(rawCpPct), 10);
  const cardPresentPct = Math.max(0, Math.min(100, Number.isFinite(parsedCpPct) ? parsedCpPct : 100));
  // MSPWare has FOUR acceptance buckets (cp / cnp-keyed / internet / moto) that
  // must sum to 100, and rejects cnp_percent >= 100. The portal collects three
  // (in-person / online / moto), so cnp is the RESIDUAL keyed portion — with a
  // 100-total portal split it is always 0. The old formula (100 - cp) double-
  // counted internet/moto and produced cnp_percent: 100 for online merchants,
  // which the processor rejected (observed live 2026-07-10, app #210).
  const midIntPct  = Math.max(0, Math.min(100, parseInt(String(merchantMID.internetPct ?? profile.internetPct ?? 0), 10) || 0));
  const midMotoPct = Math.max(0, Math.min(100, parseInt(String(merchantMID.motoPct ?? profile.motoPct ?? 0), 10) || 0));
  const cnpPct = Math.max(0, 100 - cardPresentPct - midIntPct - midMotoPct);
  // The card split is entered PER-MID in the portal (merchantMID.internetPct/motoPct);
  // the profile-level fields were a dead fallback that never existed, which
  // misclassified online merchants as 100% MOTO (2026-07-10).
  const intPct  = String(midIntPct);
  const motoPct = String(midMotoPct);
  const ownershipRaw = profile.ownershipType || matchedEntity?.ownershipType || profile.taxClassType || '';
  const ownershipType = mapOwnershipType(ownershipRaw);
  const isLLC = ownershipType === 'LL';
  // BUG FIXED 2026-07-03: llc_class was being derived from `ownershipRaw` (whichever
  // of ownershipType/taxClassType happened to resolve first), which is the WRONG
  // field — mapLlcClass expects taxClassType-style values (LLC/LLC_PARTNERSHIP/
  // LLC_CORPORATION), but ownershipRaw often resolves to an ownershipType-style
  // value instead (e.g. "LIMITED_COMPANY"), which isn't in mapLlcClass's table and
  // silently fell through to the 'D' (disregarded entity) default — even for a
  // merchant explicitly set to "LLC taxed as C-Corp". taxClassType lives per-entity
  // (profile.legalEntities[].taxClassType), matched the same way as federalEIN.
  const legalTaxClassType = matchedEntity?.taxClassType || profile.taxClassType || '';
  const annualRevenue = String(profile.annualRevenue || (parseInt(monthlyCardSales, 10) * 12));

  const additionalOwners = additionalSigners.map(s => ({
    owner_responsible_party: false,
    owner_personal_guarantee: !!s.signsPersonalGuarantee,
    principal_sign_agreement: !!s.isAuthorizedSigner,
    ownership_percent: String(s.ownershipPercentage || '0'),
    owner_title: mapOwnerTitle(s.titleType || ''),
    owner_firstname: s.firstName || '',
    owner_middlename: s.middleName || '',
    owner_lastname: s.lastName || '',
    owner_dob: formatDob(s.dobYear, s.dobMonth, s.dobDay),
    owner_phone: cleanDigits(s.corporatePhone || profile.corporatePhone || ''),
    owner_email: s.signerEmail || '',
    owner_country: 'USA',
    owner_address_type: 'PRA',
    owner_address: s.homeStreet || '',
    owner_city: s.homeCity || '',
    owner_state_usa: sanitizeState(s.homeState),
    owner_zipcode: s.homeZip || '',
    owner_citizenship_country_1: 'USA',
    owner_id_type: 'SSN',
    owner_id_number: cleanDigits(s.ssn || ''),
  }));

  return {
    full_dba_name: dbaName,
    legal_dba_name: profile.legalName || '',
    products_or_services: profile.productDescription || 'Retail goods and services',
    year_business_established: String(profile.establishmentYear || new Date().getFullYear() - 3),
    ownership_years: String(profile.currentOwnershipYears || '1'),
    ownership_months: String(profile.currentOwnershipMonths || '0'),
    ownership_type: ownershipType,
    // Only send TIN/SSN when non-empty — MSPWare rejects the ENTIRE payload for invalid formats
    ...(taxId ? { tin: taxId } : {}),
    ...(!taxId && ssn ? { ssn } : {}),
    ...(isLLC ? { llc_class: mapLlcClass(legalTaxClassType || ownershipRaw) } : {}),
    country_formation: 'USA',
    country_operations: 'USA',
    industry_type: industryType,
    contact_first_name: signer.firstName || '',
    contact_last_name: signer.lastName || '',
    business_phone: phone,
    customer_service_phone: phone,
    business_email: signer.signerEmail || profile.signerEmail || '',
    business_address_type: 'BSA',
    business_address: location.businessStreet || location.businessAddress || '',
    business_city: location.businessCity || '',
    business_state_usa: location.businessState || '',
    business_zipcode: location.businessZip || '',
    // If entity has a separate mailing address, send it as the legal address.
    // Confirmed via live resubmit: has_legal_address: 'new' is the correct value
    // (was 'mailing', rejected as invalid). Once corrected, MSPWare required a
    // distinct legal_* field block (legal_country/legal_address_type/legal_address/
    // legal_city/legal_state_usa/legal_zipcode) — NOT the mailing_* names this
    // code previously sent, which were silently dropped as unrecognized fields.
    ...(entityMailing?.street ? {
      has_legal_address: 'new',
      legal_country: 'USA',
      legal_address_type: 'BSA',
      legal_address: entityMailing.street,
      legal_city: entityMailing.city,
      legal_state_usa: sanitizeState(entityMailing.state),
      legal_zipcode: entityMailing.zip,
    } : {
      has_legal_address: 'business',
    }),
    owners: [
      {
        owner_responsible_party: true,
        owner_personal_guarantee: true,
        principal_sign_agreement: true,
        ownership_percent: String(signer.ownershipPercentage || profile.ownershipPercentage || '100'),
        owner_title: mapOwnerTitle(signer.titleType || profile.titleType || ''),
        owner_firstname: signer.firstName || '',
        owner_middlename: signer.middleName || '',
        owner_lastname: signer.lastName || '',
        owner_dob: formatDob(
          signer.dobYear || profile.dobYear,
          signer.dobMonth || profile.dobMonth,
          signer.dobDay || profile.dobDay
        ),
        owner_phone: phone,
        owner_email: signer.signerEmail || profile.signerEmail || '',
        owner_country: 'USA',
        owner_address_type: 'PRA',
        owner_address: signer.homeStreet || profile.homeStreet || '',
        owner_city: signer.homeCity || profile.homeCity || '',
        owner_state_usa: sanitizeState(signer.homeState || profile.homeState || '') || sanitizeState(location.businessState || ''),
        owner_zipcode: signer.homeZip || profile.homeZip || '',
        owner_citizenship_country_1: 'USA',
        owner_id_type: 'SSN',
        owner_id_number: ssn,
      },
      ...additionalOwners,
    ],
    has_intermediary_businesses: false,
    beneficial_ownership_exemption: 'NON',
    owner_confirmed: true,
    annual_revenue: annualRevenue,
    monthly_sales: String(monthlyCardSales),
    average_sales: avgSaleAmount,
    highest_ticket: highestTicketAmount,
    freq_highest_average_ticket: String(profile.highestTicketFrequency || '24'),
    cp_percent: String(cardPresentPct),
    cnp_percent: String(cnpPct),
    int_percent: intPct,
    moto_percent: motoPct,
    delayed_delivery: deliveryDelayDays,
    // cards_accepted / all_cards intentionally OMITTED as of 2026-07-08 — template #133
    // has all_cards: true (accept every card type, including UnionPay). Sending an
    // explicit cards_accepted list here overwrote that with a fixed 6-card list and
    // silently dropped UnionPay + the "All Cards" toggle on every application. Let
    // the template's own value pass through untouched, same as other template-owned
    // fields. See AGENTS.md.
    card_acceptance_split: cardPresentPct >= 100 ? 'CP' : 'OMNI',
    mcc,
    // ── Pricing (merchant-specific only — template owns fee schedule, debit rates, etc.) ──
    pricing_method: pricingMethod,
    pricing_category: pricingCategory,
    // is_firearm_verified intentionally omitted — any API value overrides the template and drops completion
    // billing_method, billing_frequency, funding_type, monthly_minimum_fee, chargeback_fee,
    // account_maintenance_fee, rtp_monthly_fee, C4_surcharging_cardholder_surcharge, tokenization,
    // tokenization_service_fee, monetary_code, statement_type, has_pin_debit, debit_auth_method,
    // debit_pricing_method, and all per-network debit interchange fees — all owned by template #6/#154.

    // ── Cliqbux Program Configuration ──────────────────────────────────────────
    // These are NOT merchant-derived — they're fixed Cliqbux business/reseller
    // settings in MSPWare that were incorrectly assumed to be template-owned.
    // Confirmed with Teddy 2026-07-03:
    //   - entity_number: Cliqbux's MSPWare reseller/compensation-model record.
    //     "48603 - Buy rate" is the correct entity for all merchants (not the
    //     "48605 - Clear & simple" entity a first guess might reach for).
    //   - safet_service / safet_fee: PCI compliance program. Fee is a junk fee —
    //     always send $0. Program tier defaulted to PCI Basic ('pci'); confirm
    //     with Teddy if PCI Plus ('pciplus') should be used instead.
    //   - CLEAR_plan is intentionally NOT sent: Teddy confirmed it's a legacy
    //     rate-plan picklist Cliqbux no longer offers. If MSPWare still marks it
    //     required after these other fixes, that needs a Fidano/MSPWare support
    //     ticket rather than a guessed value here.
    //   - entity_number CORRECTED 2026-07-03: the real wire value is '48603-17',
    //     not '48603'. The "-17" is Cliqbux's MSPWare Client Group ID — MSPWare's
    //     search box only displays "48603 - Buy rate" but silently combines it
    //     with the Client Group behind the scenes. Confirmed via raw GET
    //     /applications/133/form (Teddy's reference "Cash Discount Template"
    //     with Entity actually selected in the live UI) — see
    //     docs/mspware-field-reference.md.
    //   - tokenization ADDED 2026-07-03: Teddy confirmed "No tokenization is
    //     available to us now" — sent as 'none' for ALL merchants (not just Cash
    //     Discount), overriding template #154's stale 'token' default, which was
    //     the actual cause of the "Tokenization Platform Fee" required-field error.
    entity_number: '48603-17',
    safet_service: 'pci',
    safet_fee: '0',
    tokenization: 'none',

    // ── Cliqbux Cash Discount Fee Schedule (Tiered pricing only) ───────────────
    // Cliqbux never uses MSPWare's "Clear and Simple" pricing method — confirmed
    // by Teddy 2026-07-03. Cash Discount merchants use pricing_method: 'TIERD'
    // ("Tiered") instead, which requires its own explicit fee schedule (template
    // #154 was built around Clear and Simple, so its Tiered fields aren't
    // reliable). These values were confirmed live by Teddy on 2026-07-03. ICPLS
    // merchants are unaffected. See docs/mspware-field-reference.md.
    ...(pricingMethod === 'TIERD' ? {
      billing_method: 'N',
      monetary_pricing_program: '09828',
      auth_pricing_program: '49999',
      all_qualified_discount: '3.3816',     all_qualified_per_item: '0.000',
      all_mid_qualified_discount: '3.3816', all_mid_qualified_per_item: '0.000',
      all_non_qualified_discount: '3.3816', all_non_qualified_per_item: '0.000',
      all_standard_discount: '3.3816',      all_standard_per_item: '0.000',
      all_rewards_discount: '3.3816',       all_rewards_per_item: '0.000',
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
    } : {}),

    // ── Custom Flat Rate / Custom Interchange Plus markup (individually negotiated) ──
    // Always a per-merchant negotiated deal — never a static Cliqbux-wide rate. The
    // guard above already refused to reach this point if either value were missing.
    // Auth-per-card stays a fixed template-level value — no separate custom field
    // needed per Teddy 2026-07-06. See AGENTS.md Critical Lesson #12.
    ...(isCustomPricingTier ? {
      all_markup_discount: String(profile.customMarkupPercentage),
      all_markup_per_item: String(profile.customPerTxFee),
      // 2026-07-09: auth-per-card is now ALSO per-deal for custom tiers (Teddy —
      // supersedes the 2026-07-06 "template-level only, no custom field" decision).
      // HubSpot prompts all three values on custom-tier deals.
      all_card_auth_per_item: String(profile.customAuthPerCard),
    } : {}),

    // ── Cliqbux Standard Equipment Configuration ───────────────────────────────
    // Cliqbux ships and manages equipment deployment separately from the MSPWare
    // application — every merchant gets the SAME static hardware/VAR config here.
    // This is NOT merchant-configurable; do not expose it in the UI or derive it
    // from location/profile data. Confirmed with Teddy 2026-07-03 by reading the
    // raw form of MSPWare's "Cash Discount Template" (app #133) via
    // debugMSPFormRaw — these are exact wire values, not guesses. See
    // docs/mspware-field-reference.md for the full breakdown and how to update
    // this if the equipment lineup ever changes.
    foreign_network: 'NOVA',        // Network Type = "Elavon" in the UI
    equipment_rush_request: 'XX',   // POS Delivery = "Shipping Not Needed"
    eqp_hardware_section: [{
      hardware_type: 'CNVNG',            // Converge New Generation
      hardware_ownership: 'P',           // Purchase
      hardware_qty: '1',
      hardware_price_per: '0',
      hardware_connection_type: 'IP',
      hardware_capture_method: 'HYBRD',  // Hybrid
      hardware_close_method: 'AUTO',
      hardware_training_method: 'NO',    // No Training
    }],
    eqp_var_section: [
      {
        var_type: 'vendor_distributed',
        var_vendor: 'V7080',    // PAX Technology Inc
        var_product: '13231',   // Broad POS Elavon v1.0
        var_gateway: 'NONE',
        var_qty: '4',
        var_price: '0.00',
        var_capture_method: 'HOST',
        var_close_method: 'AUTO',
      },
      {
        var_type: 'service_provider',
        var_provider: 'V6273',  // Network Merchants, Inc
        var_product: '11198',   // Gateway Processing Services 10.04
        var_qty: 1,
        var_price: '0.00',
        var_capture_method: 'HOST',
        var_close_method: 'AUTO',
      },
    ],

    // ── Bank Accounts ─────────────────────────────────────────────────────────
    ...(routing && account ? {
      deposit_account_no: account,
      deposit_account_rtg: routing,
      deposit_account_type: bank.accountType === 'savings' ? 'SA' : 'CK',
    } : {}),
    statement_delivery_method: 'E',
    chargebacks_retrievals_format: 'WM',
    chargebacks_retrievals_email: signer.signerEmail || profile.signerEmail || '',
    // Additional fields commonly required for form completion
    state_of_formation: location.businessState || profile.stateOfFormation || '',
    currently_processing: profile.currentlyProcessing ? 'Y' : 'N',
    ...(profile.currentlyProcessing ? {
      current_processor_name: profile.currentProcessorName || '',
    } : {}),
    seasonal_business: profile.isSeasonal ? 'Y' : 'N',
    refund_policy: profile.refundPolicy || 'R',  // R=refund, E=exchange, N=no refund, O=other
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { corporateId } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }
    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const salespersonId = parseInt(Deno.env.get('MSP_SALESPERSON_ID') || '0', 10) || DEFAULT_SALESPERSON_ID;

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Accept':    'application/json',
      'Content-Type': 'application/json',
    };

    // ── 1. Load profile, signers, merchantMIDs, AND locations ─────────────────────
    const [profiles, signers, allMerchantMIDs, allLocs] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantMID.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

    // ── Early custom-pricing guard (2026-07-10) ───────────────────────────────
    // buildFormPayload has the same check, but it runs AFTER the MSPWare draft is
    // created — failing there strands an empty draft application in MSPWare
    // (observed on the first live ICPLS test). Fail fast here, before anything
    // is created in MSPWare.
    {
      const tierKeyEarly = (profile.pricingTier || '').toUpperCase();
      if (CUSTOM_PRICING_TIERS.includes(tierKeyEarly) &&
          (profile.customMarkupPercentage == null || profile.customPerTxFee == null || profile.customAuthPerCard == null)) {
        return Response.json({
          error: `Custom pricing not yet set for "${profile.legalName || 'this merchant'}" (pricingTier=${tierKeyEarly}). ` +
            `Your Cliqbux representative needs to set the negotiated markup, per-transaction fee, and per-auth fee ` +
            `on the deal before your application can be prepared. No application was created.`,
        }, { status: 422 });
      }
    }

    const primarySigner    = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0];
    const additionalSigners = signers?.filter((s: any) => !s.isPrimarySigner) || [];
    const primaryEmail     = primarySigner?.signerEmail || profile.signerEmail;

    if (!primaryEmail) {
      return Response.json({ error: 'No signer email found on profile or signers' }, { status: 400 });
    }

    // Build a locationId → location map
    const locationMap: Record<string, any> = {};
    for (const loc of (allLocs || [])) locationMap[loc.id] = loc;

    // Build entityId → mailing address lookup from profile's legalEntities
    const entityMailingMap: Record<string, any> = {};
    for (const ent of (profile.legalEntities || [])) {
      if (ent.entityId && ent.mailingStreet && ent.mailingCity && ent.mailingState) {
        entityMailingMap[ent.entityId] = { street: ent.mailingStreet, city: ent.mailingCity, state: ent.mailingState, zip: ent.mailingZip || '' };
      }
    }

    // ── 2. Filter to signable merchantMIDs, verifying MSP drafts still exist ─────
    const DONE_STATUSES = ['Active', 'Active (Existing)', 'Pending MID'];
    const candidateMerchantMIDs = (allMerchantMIDs || []).filter((c: any) =>
      !DONE_STATUSES.includes(c.applicationStepStatus)
    );

    // For any merchantMID with a stored mspApplicationNo, verify it still exists in MSP.
    // ONLY clear the ID on an explicit 404 — any other failure (auth, network, rate limit)
    // means we can't be sure it's gone, so we leave it in place to avoid creating duplicates.
    for (const merchantMID of candidateMerchantMIDs) {
      if (!merchantMID.mspApplicationNo) continue;
      try {
        const checkRes = await fetch(`${mspBase}/applications/${merchantMID.mspApplicationNo}`, { headers: mspHeaders });
        if (checkRes.status === 404) {
          console.warn(`[signApplication] App ${merchantMID.mspApplicationNo} returned 404 — clearing ID for "${merchantMID.dbaName}"`);
          merchantMID.mspApplicationNo = null;
          await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { mspApplicationNo: null });
        } else {
          console.log(`[signApplication] Verified app ${merchantMID.mspApplicationNo} exists (HTTP ${checkRes.status}) for "${merchantMID.dbaName}"`);
        }
      } catch (_) {
        // Non-fatal — if check fails leave the ID in place
      }
    }

    // ── 3. Auto-create MSPWare drafts for ANY merchantMID missing one (not just when signable=0) ──
    if ((allMerchantMIDs || []).length === 0) {
      return Response.json({
        success: false,
        error: 'No processing merchantMIDs found.',
        hint: 'Please complete the locations and banking setup steps first.',
      });
    }

    const needsDraft = candidateMerchantMIDs.filter((c: any) => !c.mspApplicationNo);
    if (needsDraft.length > 0) {
      console.log(`[signApplication] Auto-creating drafts for ${needsDraft.length} merchantMID(s) missing mspApplicationNo`);
      for (const merchantMID of needsDraft) {
        const location = locationMap[merchantMID.locationId];
        if (!location) {
          console.warn(`[signApplication] MerchantMID "${merchantMID.dbaName}" has no matching location (locationId=${merchantMID.locationId}) — skipping`);
          continue;
        }
        try {
          // Pick the template via pricingTier first (canonical); fall back to the
          // old pricingMethod-based cash-discount detection for any record that
          // only has pricingMethod set and no pricingTier.
          const tierKeyForTemplate = (merchantMID.pricingTier || profile.pricingTier || '').toUpperCase();
          const isCashDiscountByMethod = ['TIERD', 'CLEAR'].includes((merchantMID.pricingMethod || '').toUpperCase());
          const templateNo = merchantMID.mspTemplateNo || profile.mspTemplateNo
            || TIER_TO_TEMPLATE[tierKeyForTemplate]
            || (isCashDiscountByMethod ? CD_TEMPLATE_NO : DEFAULT_TEMPLATE_NO);
          const createBody = {
            dba: merchantMID.dbaName || location.dbaName || profile.legalName,
            merchantapplicationtypeno: MSP_APP_TYPE,
            salespersonid: salespersonId,
            templatemerchantapplicationno: templateNo,
          };
          const createRes = await fetch(`${mspBase}/applications`, {
            method: 'POST', headers: mspHeaders, body: JSON.stringify(createBody),
          });
          const createData = await createRes.json();
          console.log(`[signApplication] POST /applications response ${createRes.status} for "${merchantMID.dbaName}":`, JSON.stringify(createData));
          if (!createRes.ok || !createData.success) {
            console.error(`[signApplication] Failed to create draft for "${merchantMID.dbaName}":`, createData?.error || createData?.message);
            continue;
          }
          const mspApplicationNo = String(createData.merchantapplicationno);
          await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { mspApplicationNo, applicationStepStatus: 'In Review' });
          merchantMID.mspApplicationNo = mspApplicationNo;
          // Fill form
          const entityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
          const formPayload = buildFormPayload(profile, resolveLocationAddress(location), merchantMID, primarySigner, additionalSigners, entityMailing);
          const formRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, {
            method: 'PUT', headers: mspHeaders, body: JSON.stringify(formPayload),
          });
          const formData = await formRes.json();
          console.log(`[signApplication] Form fill ${formRes.status} for ${mspApplicationNo}:`, JSON.stringify(redactSensitive(formData)));
        } catch (err: any) {
          console.error(`[signApplication] Exception creating draft for "${merchantMID.dbaName}":`, err.message);
        }
      }
    }

    let signable = candidateMerchantMIDs.filter((c: any) => c.mspApplicationNo);

    if (signable.length === 0) {
      return Response.json({
        success: false,
        error: 'Unable to prepare signing documents.',
        hint: 'Could not create MSPWare draft applications. Check MSPWare API status and try again.',
      });
    }

    console.log(`[signApplication] corporateId=${corporateId} signable merchantMIDs: ${signable.length}`);

    // Required owners (≥25% or primary) — used to detect stale BoldSign packages
    // created before a co-owner was added (concurrent signing needs every email present).
    const requiredSignerEmails = (signers || [])
      .filter((s: any) => s?.isPrimarySigner === true || (Number(s?.ownershipPercentage) || 0) >= 25)
      .map((s: any) => String(s.signerEmail || '').toLowerCase().trim())
      .filter(Boolean);

    const isSigSigned = (s: any) =>
      ['signed', 'complete', 'completed'].includes(String(s?.localstatus || s?.status || '').toLowerCase());

    // ── 4. Process each merchantMID ───────────────────────────────────────────────
    const applications: any[] = [];

    for (const merchantMID of signable) {
      const mspApplicationNo = merchantMID.mspApplicationNo;
      const merchantName = merchantMID.dbaName || merchantMID.merchantName || `MerchantMID ${mspApplicationNo}`;

      console.log(`[signApplication] Processing app ${mspApplicationNo} (${merchantName})`);

      // Check existing signing package
      const statusRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
        headers: mspHeaders,
      });
      const statusData = await statusRes.json();

      let packageExists = statusRes.ok && statusData?.success && statusData?.signers?.length > 0;
      let forceOwnerRefill = false;

      // If a required owner is missing from an unsigned package, rebuild so concurrent
      // per-signer links exist. Do NOT rebuild once anyone has already signed.
      if (packageExists) {
        const packageEmails = new Set(
          (statusData?.signers || [])
            .map((s: any) => String(s.emailAddress || s.email || '').toLowerCase().trim())
            .filter(Boolean)
        );
        const missingOwners = requiredSignerEmails.filter((e: string) => !packageEmails.has(e));
        const anyoneSigned = (statusData?.signers || []).some(isSigSigned)
          || statusData?.signed === true
          || statusData?.status === 'complete';

        if (missingOwners.length > 0 && !anyoneSigned) {
          console.warn(
            `[signApplication] App ${mspApplicationNo} package missing owners [${missingOwners.join(', ')}] — rebuilding unsigned package`
          );
          forceOwnerRefill = true;
          packageExists = false;
          // Best-effort clear of the stale package so POST can recreate with full owner set
          try {
            const delRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
              method: 'DELETE',
              headers: mspHeaders,
            });
            console.log(`[signApplication] DELETE /signatures ${delRes.status} for ${mspApplicationNo}`);
          } catch (delErr: any) {
            console.warn(`[signApplication] DELETE /signatures failed (continuing):`, delErr?.message);
          }
        } else if (missingOwners.length > 0 && anyoneSigned) {
          console.warn(
            `[signApplication] App ${mspApplicationNo} missing [${missingOwners.join(', ')}] but signing already started — cannot rebuild`
          );
        }
      }

      // Check current form completion via GET first — template defaults may already satisfy all fields
      let refillPercentComplete: number | null = null;
      let refillErrors: string[] = [];
      if (!packageExists) {
        const getRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, { headers: mspHeaders });
        const getData = await getRes.json();
        // percent_complete may be a string from MSPWare — parse it
        const rawPct = getData?.percent_complete ?? getData?.validation?.percent_complete ?? null;
        refillPercentComplete = rawPct !== null ? Math.round(parseFloat(String(rawPct))) : null;
        // Log full form response to surface any hidden completion/rule errors
        console.log(`[signApplication] Full GET form response for ${mspApplicationNo}:`, JSON.stringify(redactSensitive(getData)));

        const getErrors = [
              ...(getData?.completion_errors || getData?.validation?.errors?.completion || []),
              ...(getData?.data_errors       || getData?.validation?.errors?.data       || []),
              ...(getData?.rule_violations   || getData?.validation?.errors?.rules      || []),
              // Also look for errors nested in form.errors or top-level errors array
              ...(getData?.errors            || []),
              ...(getData?.form?.errors      || []),
            ].map((e: any) => (typeof e === 'string' ? e : e?.message || e?.description || e?.errors || JSON.stringify(e)));
        console.log(`[signApplication] GET form status for ${mspApplicationNo}: ${refillPercentComplete ?? '?'}% complete, ${getErrors.length} errors`);

        // Re-fill when not at 100%, OR when co-owners were added after the last package
        // (forceOwnerRefill) so MSPWare's owners[] includes every required signer email.
        if (refillPercentComplete !== 100 || forceOwnerRefill) {
          const location = locationMap[merchantMID.locationId];
          if (location) {
            const refillEntityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
          const formPayload = buildFormPayload(profile, resolveLocationAddress(location), merchantMID, primarySigner, additionalSigners, refillEntityMailing);
            const refillRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, {
              method: 'PUT', headers: mspHeaders, body: JSON.stringify(formPayload),
            });
            const refillData = await refillRes.json();
            // THE REAL ERROR LIVES IN THE PUT RESPONSE: MSPWare rolls the whole
            // form back when ANY field fails PUT validation, so the follow-up GET
            // only shows generic "everything missing" completion errors. Observed
            // live 2026-07-10: a single rejected field made the UI claim owner
            // DOB/SSN and bank were missing when all three were saved and sent.
            const putErrors = [
              ...(refillData?.validation?.errors?.data  || refillData?.data_errors     || []),
              ...(refillData?.validation?.errors?.rules || refillData?.rule_violations || []),
              ...(refillData?.errors || []),
            ].map((e: any) => (typeof e === 'string' ? e : e?.message || e?.description || JSON.stringify(e)));
            if (putErrors.length) console.log(`[signApplication] PUT validation errors for ${mspApplicationNo}:`, JSON.stringify(putErrors));
            // After PUT, always re-check via GET for true completion (PUT response can be misleading)
            const getRes2 = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, { headers: mspHeaders });
            const getData2 = await getRes2.json();
            const rawPct2 = getData2?.percent_complete ?? getData2?.validation?.percent_complete ?? null;
            refillPercentComplete = rawPct2 !== null ? Math.round(parseFloat(String(rawPct2))) : null;
        console.log(`[signApplication] Full GET form response AFTER refill for ${mspApplicationNo}:`, JSON.stringify(redactSensitive(getData2)));

            // PUT rejections are the authoritative cause; the GET list after a
            // rollback is misleading noise, so only fall back to it when the PUT
            // reported nothing.
            refillErrors = putErrors.length
              ? putErrors.map((e: string) => `Processor rejected a value — ${e}`)
              : [
                  ...(getData2?.completion_errors || getData2?.validation?.errors?.completion || []),
                  ...(getData2?.data_errors       || getData2?.validation?.errors?.data       || []),
                  ...(getData2?.rule_violations   || getData2?.validation?.errors?.rules      || []),
                  ...(getData2?.errors            || []),
                  ...(getData2?.form?.errors      || []),
                ].map((e: any) => (typeof e === 'string' ? e : e?.message || e?.description || e?.errors || JSON.stringify(e)));
            console.log(`[signApplication] After refill GET: ${refillPercentComplete ?? '?'}% complete, ${refillErrors.length} errors`);
            if (refillErrors.length) console.log(`[signApplication] Errors:`, JSON.stringify(refillErrors));
          }
        } else {
          console.log(`[signApplication] Form already at 100% — skipping re-fill`);
        }
      }

      // Create package if not yet done
      if (!packageExists) {
        console.log(`[signApplication] Creating signature package for app ${mspApplicationNo}`);
        const packageRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
          method: 'POST',
          headers: mspHeaders,
          body: JSON.stringify({ sendEmail: false }),
        });
        const packageData = await packageRes.json();
        console.log(`[signApplication] POST /signatures ${packageRes.status}:`, JSON.stringify(packageData));

        if (!packageRes.ok || !packageData?.success) {
          const errMsg = packageData?.error || packageData?.message || `HTTP ${packageRes.status}`;
          applications.push({
            mspApplicationNo,
            merchantName,
            signingUrl: null,
            signers: [],
            allSigned: false,
            error: `Unable to prepare signing package: ${errMsg}`,
            hint: refillPercentComplete !== null && refillPercentComplete < 100
              ? `Form is ${refillPercentComplete}% complete. ${refillErrors.join('; ')}`
              : 'Contact support if this persists.',
            percentComplete: refillPercentComplete,
            formErrors: refillErrors,
          });
          continue;
        }

        packageExists = true;
      }

      // Re-fetch to get current signer list with statuses
      const freshRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
        headers: mspHeaders,
      });
      const freshData = await freshRes.json();
      const signerList: any[] = freshData?.signers || [];
      const overallSigned = freshData?.signed === true || freshData?.status === 'complete';

      // Get signing link for each package signer + any required roster email still missing
      // (concurrent signing: every required owner needs their own BoldSign URL).
      let primarySigningUrl: string | null = null;
      const signerLinks: any[] = [];
      const emailsToFetch = new Set<string>();
      for (const s of signerList) {
        const email = String(s.emailAddress || s.email || '').toLowerCase().trim();
        if (email) emailsToFetch.add(email);
      }
      for (const e of requiredSignerEmails) emailsToFetch.add(e);

      for (const email of emailsToFetch) {
        const pkgRow = signerList.find((s: any) =>
          String(s.emailAddress || s.email || '').toLowerCase().trim() === email
        );
        const alreadySigned = pkgRow ? isSigSigned(pkgRow) : false;

        let link: string | null = null;
        if (!alreadySigned) {
          // Fetch link — retry once after 1s if not yet available (BoldSign may need a moment after package creation)
          for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
            const linkRes = await fetch(
              `${mspBase}/applications/${mspApplicationNo}/signatures/link?emailAddress=${encodeURIComponent(email)}`,
              { headers: mspHeaders }
            );
            const linkData = await linkRes.json();
            link = linkData?.link || null;
            if (link) break;
          }
        }

        signerLinks.push({
          email,
          name: pkgRow?.name || '',
          status: pkgRow?.localstatus || pkgRow?.status || (link ? 'ready' : 'missing'),
          signed: alreadySigned,
          signingUrl: link,
          inPackage: !!pkgRow,
        });

        if (email === primaryEmail.toLowerCase() && link) {
          primarySigningUrl = link;
        }
      }

      // Fallback: try primaryEmail directly if not found in signer list
      if (!primarySigningUrl && primaryEmail) {
        const fallbackRes = await fetch(
          `${mspBase}/applications/${mspApplicationNo}/signatures/link?emailAddress=${encodeURIComponent(primaryEmail)}`,
          { headers: mspHeaders }
        );
        const fallbackData = await fallbackRes.json();
        primarySigningUrl = fallbackData?.link || null;
      }

      const appAllSigned = requiredSignerEmails.length > 0
        ? requiredSignerEmails.every((email: string) => {
            const row = signerLinks.find((s: any) => s.email === email);
            return row?.signed === true;
          })
        : (signerList.length > 0 && signerList.every((s: any) => isSigSigned(s)));

      const missingLinks = signerLinks
        .filter((s: any) => requiredSignerEmails.includes(s.email) && !s.signed && !s.signingUrl)
        .map((s: any) => s.email);

      // signingUrl = primary convenience link (legacy). Concurrent UI uses signers[].signingUrl.
      applications.push({
        mspApplicationNo,
        merchantName,
        merchantIDName: merchantName,
        signingUrl: primarySigningUrl,
        signers: signerLinks,
        allSigned: appAllSigned || overallSigned,
        missingSignerEmails: missingLinks,
        error: null,
      });
    }

    const totalCount  = applications.length;
    const totalSigned = applications.filter((a: any) => a.allSigned).length;
    const allSigned   = totalCount > 0 && totalSigned === totalCount;

    console.log(`[signApplication] Done. ${totalSigned}/${totalCount} signed.`);

    return Response.json({
      success: true,
      primaryEmail,
      applications,
      totalCount,
      totalSigned,
      allSigned,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});