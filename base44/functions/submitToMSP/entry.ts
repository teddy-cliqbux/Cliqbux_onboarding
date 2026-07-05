import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── MSPWare / PulsePoint Constants ───────────────────────────────────────────
// Application type 24 = "Elavon US Application" in this account
const MSP_APP_TYPE = 24;
// Template 6  = "Cliqbux Template Swipe Keyed"  — ICPLS (interchange plus) default
// Template 154 = "Cliqbux Template Cash Discount" — Cash Discount / CLEAR pricing
// Override per-merchant via profile.mspTemplateNo if needed
const DEFAULT_TEMPLATE_NO = 6;
const CD_TEMPLATE_NO = 154;

// Maps the merchant's chosen pricingTier to the correct MSPWare pricing_method.
// MerchantMID.pricingMethod has a schema-level default of 'ICPLS', which will
// silently mask this derivation if the field is left unset at create time —
// always set it explicitly at every MerchantMID creation site rather than
// relying on the schema default.
const TIER_TO_METHOD: Record<string, string> = {
  'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS',
  'SELF_SWIPED': 'ICPLS', 'SELF_KEYED': 'ICPLS',
  // 2026-07-03: Teddy confirmed Cliqbux never uses MSPWare's "Clear and Simple"
  // pricing method — every Cash Discount plan uses "Tiered" (wire value TIERD)
  // instead, with a flat-rate fee schedule sent explicitly in buildFormPayload.
  // See docs/mspware-field-reference.md.
  'CASH_DISCOUNT': 'TIERD', 'SELF_CASH_DISCOUNT': 'TIERD',
};

// ─── Value Mappings ───────────────────────────────────────────────────────────

function mapOwnershipType(t: string): string {
  const map: Record<string, string> = {
    'SOLE_PROP':        'SP',
    'SOLE_PROPRIETOR':  'SP',
    'LLC':              'LL',
    'LLC_CORPORATION':  'LL',
    'LLC_PARTNERSHIP':  'LL',
    'CORPORATION':      'CO',
    'C_CORP':           'CO',
    'S_CORP':           'SS',
    'SUB_S_CORP':       'SS',
    'PARTNERSHIP':      'PA',
    'LIMITED_COMPANY':  'LL',
    'NON_PROFIT':       'NP',
    'TRUST':            'T',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'CO';
}

// Maps LLC subtype → Elavon ClassificationCode (only used when ownership_type = 'LL')
// Confirmed valid from live apps: "C" (C-corp election), "P" (partnership), "D" (disregarded entity)
function mapLlcClass(t: string): string {
  const map: Record<string, string> = {
    'LLC':              'D',
    'LLC_PARTNERSHIP':  'P',
    'LLC_CORPORATION':  'C',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'D';
}

function mapOwnerTitle(t: string): string {
  const map: Record<string, string> = {
    // Full enum values from MerchantSigners / MerchantCorporateProfile entities
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
    // Short aliases
    'CEO':    'CEO',
    'CFO':    'CFO',
    'COO':    'COO',
    'VP':     'VP',
    'MM':     'MM',
  };
  return map[t] || map[t?.toUpperCase?.()] || 'OP';
}

// Maps pricing category number → Elavon IndustryCode
// Confirmed from live approved apps: RE=Retail, RS=Restaurant, SP=Supermarket
function mapIndustryType(pricingCategory: string): string {
  const map: Record<string, string> = {
    '1':  'RE',
    '2':  'HT',
    '4':  'SP',
    '5':  'ARU',
    '6':  'MS',
    '7':  'RS',
    '13': 'RE',
  };
  return map[pricingCategory] || 'RE';
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

// When a location was saved via the "unverified" path, structured fields may be null.
// Parse them from the flat businessAddress string as a fallback.
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

// MSPWare only accepts the 50 US states — territories (GU, PR, VI, AS, MP) cause data errors
const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
function sanitizeState(s: string): string {
  const code = (s || '').toUpperCase().trim();
  return US_STATES.has(code) ? code : '';
}

// Maps our internal industryClass enum → MSPWare industry_type code
function industryClassToMSP(cls: string): string {
  const map: Record<string, string> = {
    'RESTAURANT': 'RS',
    'GROCERY':    'SP',
    'HOTEL':      'HT',
    'ECOMMERCE':  'MS',
    'SERVICES':   'RE',
    'RETAIL':     'RE',
    'AUTO':       'RE',
    'HEALTH':     'RE',
    'SALON':      'RE',
    'GYM':        'RE',
    'BAR':        'RS',
    'CLOTHING':   'RE',
    'ELECTRONICS':'RE',
    'FURNITURE':  'RE',
  };
  return map[cls] || 'RE';
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
// buildFormPayload sends ONLY the merchant-specific fields listed below.
// The following are intentionally OMITTED for ICPLS (non-Cash-Discount) merchants
// because the template owns them:
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
// the template via GET /applications/154/form before adding it here.
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
// affected — those fields remain omitted/template-owned for ICPLS as before. See
// the "Cliqbux Cash Discount Fee Schedule" block below and
// docs/mspware-field-reference.md.
//
// Merchant-supplied fields sent here:
//   full_dba_name, legal_dba_name, products_or_services, year_business_established,
//   ownership_years/months, ownership_type, tin/ssn, llc_class, industry_type,
//   contact_first/last_name, business_phone/email, business_address (all parts),
//   has_legal_address / mailing_address (when entity has separate mailing address),
//   owners[] (all signer fields), has_intermediary_businesses,
//   beneficial_ownership_exemption, owner_confirmed, annual_revenue, monthly_sales,
//   average_sales, highest_ticket, freq_highest_average_ticket,
//   cp_percent, cnp_percent, int_percent, moto_percent, delayed_delivery,
//   cards_accepted, card_acceptance_split, mcc, pricing_method, pricing_category,
//   deposit_account_no/rtg/type (bank — only when both routing+account present),
//   statement_delivery_method, chargebacks_retrievals_format/email,
//   state_of_formation, currently_processing, seasonal_business, refund_policy

function buildFormPayload(
  profile: Record<string, any>,
  location: Record<string, any>,
  merchantMID: Record<string, any>,
  primarySigner: Record<string, any>,
  additionalSigners: Record<string, any>[],
  entityMailing?: { street: string; city: string; state: string; zip: string } | null
): Record<string, unknown> {

  const signer = primarySigner || {};

  // Bank: merchantMID-level account overrides location (e.g. bakery settles to different account)
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

  // MerchantMID-level fields override profile-level for per-MID differentiation
  const pricingCategory = String(merchantMID.pricingCategory || profile.pricingCategory || '1');
  // TIER_TO_METHOD is declared once at module scope above — used here and by
  // every MerchantMID creation site in this file.
  const rawPricingMethod = merchantMID.pricingMethod || profile.pricingMethod
    || TIER_TO_METHOD[(merchantMID.pricingTier || profile.pricingTier || '').toUpperCase()]
    || 'ICPLS';
  const pricingMethod = rawPricingMethod.toUpperCase() === 'CASH_DISCOUNT' ? 'TIERD' : rawPricingMethod;
  // Derive industryType from pricingCategory; only use merchantMID.industryType if pricingCategory is also set
  const industryType = (merchantMID.pricingCategory && merchantMID.industryType)
    ? merchantMID.industryType
    : mapIndustryType(pricingCategory);
  const mcc = merchantMID.mccCode || profile.mccCode || '5999';
  const dbaName = merchantMID.dbaName || location.dbaName || profile.legalName || '';
  const monthlyCardSales = Math.max(1, parseFloat(String(merchantMID.monthlyCardSales || profile.monthlyCardSales || '6000')) || 6000);
  const rawAvg = parseFloat(String(merchantMID.avgSaleAmount || profile.avgSaleAmount || '100')) || 100;
  const rawHighest = parseFloat(String(merchantMID.highestTicketAmount || profile.highestTicketAmount || '200')) || 200;
  // MSPWare rules:
  // 1. average_sales must be LESS THAN monthly_sales
  // 2. highest_ticket must be STRICTLY GREATER THAN average_sales AND less than monthly_sales
  const cap = Math.max(monthlyCardSales - 1, 1);
  const avgSaleAmount = String(Math.min(rawAvg, cap));
  const minHighest = Math.min(rawAvg, cap) + 1; // at least 1 more than average
  const highestTicketAmount = String(Math.min(Math.max(rawHighest, minHighest), cap));
  // MSPWare rule: delayed_delivery must be >= 1
  const rawDelay = parseInt(String(merchantMID.deliveryDelayDays ?? profile.deliveryDelayDays ?? '0'), 10);
  const deliveryDelayDays = String(Math.max(rawDelay, 1));
  // cardPresentPct: treat null/undefined as 100 (in-person default), NOT 0
  const rawCpPct = merchantMID.cardPresentPct != null ? merchantMID.cardPresentPct : (profile.cardPresentPct != null ? profile.cardPresentPct : 100);
  const cardPresentPct = Math.max(0, Math.min(100, parseInt(String(rawCpPct), 10) || 100));
  const cnpPct = 100 - cardPresentPct;
  // internetPct and motoPct are collected separately on Step 2.
  // int_percent = internet only; MSPWare derives MOTO as cnp - int.
  // Default: if no internet breakdown is set, assume all CNP is internet (covers MOTO-only merchants too).
  const intPct  = cnpPct > 0 ? String(profile.internetPct ?? 0) : '0';
  const motoPct = cnpPct > 0 ? String(profile.motoPct ?? Math.max(0, cnpPct - parseInt(intPct, 10))) : '0';

  const ownershipRaw = profile.ownershipType || profile.taxClassType || '';
  const ownershipType = mapOwnershipType(ownershipRaw);
  const isLLC = ownershipType === 'LL';

  const annualRevenue = String(
    profile.annualRevenue || (parseInt(monthlyCardSales, 10) * 12)
  );

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
    // ── Merchant Information ──────────────────────────────────────────────────
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
    ...(isLLC ? { llc_class: mapLlcClass(ownershipRaw) } : {}),
    country_formation: 'USA',
    country_operations: 'USA',
    industry_type: industryType,

    // ── Addresses ────────────────────────────────────────────────────────────
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

    // ── Principals ───────────────────────────────────────────────────────────
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

    // ── Financial Information ─────────────────────────────────────────────────
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

    // ── Card Acceptance ───────────────────────────────────────────────────────
    cards_accepted: ['VISA', 'VISA_DEBIT', 'MASTERCARD', 'MASTERCARD_DEBIT', 'DISCOVER', 'AMEX'],
    card_acceptance_split: cardPresentPct >= 100 ? 'CP' : 'OMNI',

    // ── Industry / MCC ────────────────────────────────────────────────────────
    mcc,

    // ── Pricing (merchant-specific only — all fee/rate/config fields omitted; template owns them) ──
    pricing_method: pricingMethod,
    pricing_category: pricingCategory,
    // NOTE: billing_method, annual_fee_start_date, auth_pricing_program, all_markup_*,
    // intl_card_handling_fee, tokenization_*, has_pin_debit, debit_*, all ACCL_*/AFFN_*/etc
    // per-network debit fields, and is_firearm_verified are all intentionally omitted.
    // See the STRICT TEMPLATE PRESERVATION RULE comment above buildFormPayload.

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
    // merchants are unaffected — this block only applies when pricingMethod is
    // Cash Discount's wire value. See docs/mspware-field-reference.md.
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

    // ── Bank Accounts (only when both routing + account are present) ──────────
    ...(routing && account ? {
      deposit_account_no: account,
      deposit_account_rtg: routing,
      deposit_account_type: bank.accountType === 'savings' ? 'SA' : 'CK',
    } : {}),

    // ── Statements + remaining merchant fields ────────────────────────────────
    statement_delivery_method: 'E',
    chargebacks_retrievals_format: 'WM',
    chargebacks_retrievals_email: signer.signerEmail || profile.signerEmail || '',
    state_of_formation: location.businessState || profile.stateOfFormation || '',
    currently_processing: profile.currentlyProcessing ? 'Y' : 'N',
    ...(profile.currentlyProcessing ? {
      current_processor_name: profile.currentProcessorName || '',
    } : {}),
    seasonal_business: profile.isSeasonal ? 'Y' : 'N',
    refund_policy: profile.refundPolicy || 'R',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, midIds, locationIds } = body;

    if (!corporateId) return Response.json({ error: 'corporateId is required' }, { status: 400 });

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const salespersonId = parseInt(Deno.env.get('MSP_SALESPERSON_ID') || '0', 10);
    const submitEnabled = Deno.env.get('MSP_SUBMIT_ENABLED') === 'true';

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // ── Fetch merchant data ────────────────────────────────────────────────────
    const [profiles, allMerchantMIDs, allLocs, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantMID.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

    // ── Auto-create merchantMIDs for new merchants who have locations but no merchantMIDs yet ──
    // This covers the standard onboarding flow: merchant adds location(s) via the UI,
    // then clicks Submit on the verification page before the tree UI / migration creates merchantMIDs.
    let merchantMIDsCreatedAuto = 0;
    if (!allMerchantMIDs?.length && allLocs?.length) {
      console.log(`[submitToMSP] No merchantMIDs found — auto-creating from ${allLocs.length} location(s)`);
      for (const loc of allLocs) {
        try {
          await base44.asServiceRole.entities.MerchantMID.create({
            locationId:      loc.id,
            corporateId,
            merchantName:     loc.dbaName || profile.legalName,
            dbaName:         loc.dbaName || profile.legalName,
            mccCode:         profile.mccCode || profile.mcc || '5999',
            industryType:    profile.industryClass ? industryClassToMSP(profile.industryClass) : 'RE',
            pricingCategory: '1',
            // Derived from profile.pricingTier — was previously hardcoded 'ICPLS'
            // regardless of tier, which silently broke Cash Discount merchants
            // whose applications get auto-created via this fallback path.
            pricingMethod:   TIER_TO_METHOD[(profile.pricingTier || '').toUpperCase()] || 'ICPLS',
            monthlyCardSales:    parseFloat(String(profile.monthlyCardSales || '0')) || null,
            avgSaleAmount:       parseFloat(String(profile.avgSaleAmount || '0')) || null,
            highestTicketAmount: parseFloat(String(profile.highestTicketAmount || '0')) || null,
            cardPresentPct:      parseFloat(String(profile.cardPresentPct || '100')) || 100,
            applicationStepStatus: 'In Review',
          });
          merchantMIDsCreatedAuto++;
        } catch (err: any) {
          console.warn(`[submitToMSP] Could not auto-create merchantMID for location ${loc.id}: ${err.message}`);
        }
      }
      // Re-fetch merchantMIDs now that we've created them
      const freshMerchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId });
      allMerchantMIDs.push(...(freshMerchantMIDs || []));
    }

    if (!allMerchantMIDs?.length) return Response.json({ error: 'No processing merchantMIDs found and no locations to derive them from' }, { status: 404 });

    // Build a locationId → location lookup for fast joins
    const locatio