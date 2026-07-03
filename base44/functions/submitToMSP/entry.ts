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
  'CASH_DISCOUNT': 'CLEAR', 'SELF_CASH_DISCOUNT': 'CLEAR',
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
// The following are intentionally OMITTED because the template owns them:
//
//   billing_method, billing_frequency, funding_type, monetary_code, statement_type,
//   monthly_minimum_fee, chargeback_fee, account_maintenance_fee, rtp_monthly_fee,
//   touch_tone_auth, avs_service_auth, bank_referral_auth, op_assisted_auth,
//   C4_surcharging_cardholder_surcharge, tokenization, tokenization_service_fee,
//   tokenization_platform_fee, tokenization_sharing_indicator,
//   has_pin_debit, debit_auth_method, debit_pricing_method,
//   all per-network debit interchange fee fields (ACCL_*, AFFN_*, ALAS_*, CU24_*,
//   INKL_*, MSTO_*, NETS_*, NYCE_*, POSD_*, PULSE_*, ITS_*, STAR_*, UPDBT_*),
//   fixed_individual_tiers_pricing, multi_currency_conversion, secure3d,
//   all_markup_discount, all_markup_per_item, all_card_auth_per_item,
//   intl_card_handling_fee, auth_pricing_program, annual_fee_start_date,
//   is_firearm_verified (CRITICAL: every value is rejected by the API; omit always
//   — this is a template-level default that needs fixing directly on templates
//   #6/#154 in MSPWare, not something this function can send. See AGENTS.md.)
//
// If you need to add a new field, verify it is NOT in the template by reading
// the template via GET /applications/154/form before adding it here.
//
// EXCEPTION — Cliqbux Program Configuration fields (entity_number, safet_service,
// safet_fee): these look like template-owned config but are actually Cliqbux
// business/reseller settings that no template can supply per-merchant. See the
// "Cliqbux Program Configuration" block below for the confirmed values and why.
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
  const pricingMethod = rawPricingMethod.toUpperCase() === 'CASH_DISCOUNT' ? 'CLEAR' : rawPricingMethod;
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
    entity_number: '48603',
    safet_service: 'pci',
    safet_fee: '0',

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
    const locationMap: Record<string, any> = {};
    for (const loc of (allLocs || [])) {
      locationMap[loc.id] = loc;
    }

    // Build a entityId → mailing address lookup from profile's legalEntities
    const entityMailingMap: Record<string, any> = {};
    for (const ent of (profile.legalEntities || [])) {
      if (ent.entityId && ent.mailingStreet && ent.mailingCity && ent.mailingState) {
        entityMailingMap[ent.entityId] = { street: ent.mailingStreet, city: ent.mailingCity, state: ent.mailingState, zip: ent.mailingZip || '' };
      }
    }

    // Filter merchantMIDs if caller specified specific IDs
    let merchantMIDs = allMerchantMIDs;
    if (midIds?.length) {
      merchantMIDs = merchantMIDs.filter((c: any) => midIds.includes(c.id));
    } else if (locationIds?.length) {
      // Backward-compat: callers that pass locationIds get merchantMIDs for those locations
      merchantMIDs = merchantMIDs.filter((c: any) => locationIds.includes(c.locationId));
    }

    const primarySigner = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0] || {};
    const additionalSigners = signers?.filter((s: any) => !s.isPrimarySigner) || [];

    const results = [];
    let allSuccessful = true;

    for (const merchantMID of merchantMIDs) {
      // ── Skip already-boarded merchantMIDs ────────────────────────────────────────
      if (['Pending MID', 'Active', 'Active (Existing)'].includes(merchantMID.applicationStepStatus)) {
        results.push({
          midId: merchantMID.id,
          locationId: merchantMID.locationId,
          dbaName: merchantMID.dbaName,
          status: 'skipped',
          reason: `Already ${merchantMID.applicationStepStatus}`,
        });
        continue;
      }

      // ── Join to location for address + fallback bank ──────────────────────
      const location = resolveLocationAddress(locationMap[merchantMID.locationId]);
      if (!location) {
        results.push({
          midId: merchantMID.id,
          dbaName: merchantMID.dbaName,
          status: 'error',
          error: `Location ${merchantMID.locationId} not found`,
        });
        allSuccessful = false;
        continue;
      }

      try {
        // ── Step 1: Create draft application (skip if already has one, unless it was deleted) ────────
        let mspApplicationNo = merchantMID.mspApplicationNo;

        // If we have a stored application number, verify it still exists in MSP.
        // If it was deleted from the MSP dashboard, clear it so we create a fresh draft.
        if (mspApplicationNo) {
          const checkRes = await fetch(`${mspBase}/applications/${mspApplicationNo}`, { headers: mspHeaders });
          if (checkRes.status === 404) {
            console.warn(`[submitToMSP] Application ${mspApplicationNo} not found in MSP (deleted?) — will create a new draft for "${merchantMID.dbaName}"`);
            mspApplicationNo = null;
            await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { mspApplicationNo: null });
          } else {
            console.log(`[submitToMSP] Reusing existing draft ${mspApplicationNo} for "${merchantMID.dbaName}"`);
          }
        }

        if (!mspApplicationNo) {
          // Detect cash discount via pricingMethod (wire value "CLEAR") OR pricingTier (UI value "CASH_DISCOUNT")
          const isCashDiscount =
            ['CLEAR', 'CASH_DISCOUNT'].includes((merchantMID.pricingMethod || '').toUpperCase()) ||
            ['CASH_DISCOUNT', 'SELF_CASH_DISCOUNT'].includes((merchantMID.pricingTier || profile.pricingTier || '').toUpperCase());
          const templateNo = merchantMID.mspTemplateNo || profile.mspTemplateNo || (isCashDiscount ? CD_TEMPLATE_NO : DEFAULT_TEMPLATE_NO);
          const createBody = {
            dba: merchantMID.dbaName || location.dbaName || profile.legalName,
            merchantapplicationtypeno: MSP_APP_TYPE,
            salespersonid: salespersonId,
            templatemerchantapplicationno: templateNo,
          };

          const createRes = await fetch(`${mspBase}/applications`, {
            method: 'POST',
            headers: mspHeaders,
            body: JSON.stringify(createBody),
          });
          const createData = await createRes.json();

          if (!createRes.ok || !createData.success) {
            console.error(`[submitToMSP] Failed to create application for "${merchantMID.dbaName}":`, JSON.stringify(createData));
            await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { applicationStepStatus: 'Error' });
            results.push({
              midId: merchantMID.id,
              locationId: merchantMID.locationId,
              dbaName: merchantMID.dbaName,
              status: 'error',
              error: createData.error || createData.message || `HTTP ${createRes.status}`,
            });
            allSuccessful = false;
            continue;
          }

          mspApplicationNo = createData.merchantapplicationno;
          console.log(`[submitToMSP] Created application ${mspApplicationNo} for "${merchantMID.dbaName}"`);

          // Persist application number immediately so it's trackable even if form fill fails
          await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, {
            mspApplicationNo: String(mspApplicationNo),
            applicationStepStatus: 'In Review',
          });
        }

        // ── Step 2: Fill form ─────────────────────────────────────────────────
        const entityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
        const formPayload = buildFormPayload(profile, location, merchantMID, primarySigner, additionalSigners, entityMailing);
        console.log(`[submitToMSP] Filling form for application ${mspApplicationNo}:`, JSON.stringify(redactSensitive(formPayload), null, 2));

        const formRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, {
          method: 'PUT',
          headers: mspHeaders,
          body: JSON.stringify(formPayload),
        });
        const formData = await formRes.json();
        console.log(`[submitToMSP] Form fill response ${formRes.status}:`, JSON.stringify(redactSensitive(formData), null, 2));

        // Per the actual MSPWare API spec (mspware-swagger.json), the PUT /form
        // response nests everything under `validation` — { validation: { errors:
        // { data, completion, rules }, percent_complete, messages, canSave, form } }.
        // This file previously read these off the top level of formData directly,
        // which meant percentComplete/validationErrors/messages were ALWAYS empty
        // regardless of what MSPWare actually reported — masking real validation
        // errors and silent field-clearing messages this whole time.
        const validation = formData?.validation || {};
        const percentComplete = validation?.percent_complete ?? null;
        const validationErrors = [
          ...(validation?.errors?.data || []),
          ...(validation?.errors?.completion || []),
          ...(validation?.errors?.rules || []),
        ];
        const mspMessages = validation?.messages || [];

        // Log form fill issues but don't abort — template defaults may cover remaining fields,
        // and signApplication will re-fill + verify completion before creating the signing package.
        if (!formRes.ok) {
          console.error(`[submitToMSP] Form PUT HTTP error ${formRes.status} for ${mspApplicationNo}:`, JSON.stringify(redactSensitive(formData)));
        } else {
          console.log(`[submitToMSP] Form fill ${mspApplicationNo}: ${percentComplete ?? '?'}% complete, canSave=${formData?.canSave}, errors=${validationErrors.length}`);
        }

        // ── Step 3: Submit (only if MSP_SUBMIT_ENABLED=true) ──────────────────
        if (!submitEnabled) {
          results.push({
            midId: merchantMID.id,
            locationId: merchantMID.locationId,
            dbaName: merchantMID.dbaName,
            status: 'draft_created',
            mspApplicationNo,
            percentComplete,
            validationErrors,
            mspMessages, // TEMP DIAGNOSTIC — see comment above
            note: 'Set MSP_SUBMIT_ENABLED=true to submit to Elavon',
          });
          continue;
        }

        const submitRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/submit`, {
          method: 'PUT',
          headers: mspHeaders,
          body: JSON.stringify({}),
        });
        const submitData = await submitRes.json();
        console.log(`[submitToMSP] Submit response ${submitRes.status}:`, JSON.stringify(redactSensitive(submitData), null, 2));

        if (submitRes.ok && submitData?.success) {
          await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, {
            applicationStepStatus: 'Pending MID',
          });
          results.push({
            midId: merchantMID.id,
            locationId: merchantMID.locationId,
            dbaName: merchantMID.dbaName,
            status: 'submitted',
            mspApplicationNo,
            percentComplete,
          });
        } else {
          await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { applicationStepStatus: 'Error' });
          results.push({
            midId: merchantMID.id,
            locationId: merchantMID.locationId,
            dbaName: merchantMID.dbaName,
            status: 'submit_error',
            mspApplicationNo,
            error: submitData?.error || submitData?.message || `HTTP ${submitRes.status}`,
            rawSubmitResponse: submitData,
          });
          allSuccessful = false;
        }

      } catch (err: any) {
        console.error(`[submitToMSP] Exception for "${merchantMID.dbaName}":`, err.message);
        await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { applicationStepStatus: 'Error' });
        results.push({
          midId: merchantMID.id,
          locationId: merchantMID.locationId,
          dbaName: merchantMID.dbaName,
          status: 'error',
          error: err.message,
        });
        allSuccessful = false;
      }
    }

    return Response.json({
      success: allSuccessful,
      allSubmitted: allSuccessful && results.every(r => ['submitted', 'skipped', 'draft_created'].includes(r.status)),
      submitEnabled,
      corporateId,
      merchantMIDsAutoCreated: merchantMIDsCreatedAuto,
      results,
    });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});