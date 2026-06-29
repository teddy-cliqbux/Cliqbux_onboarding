import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── MSPWare / PulsePoint Constants ───────────────────────────────────────────
// Application type 24 = "Elavon US Application" in this account
const MSP_APP_TYPE = 24;
// Template 6  = "Cliqbux Template Swipe Keyed"  — ICPLS (interchange plus) default
// Template 154 = "Cliqbux Template Cash Discount" — Cash Discount / CLEAR pricing
// Override per-merchant via profile.mspTemplateNo if needed
const DEFAULT_TEMPLATE_NO = 6;
const CD_TEMPLATE_NO = 154;

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

function nextMonthStart(): string {
  const now = new Date();
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const m = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

// ─── Form Payload Builder ─────────────────────────────────────────────────────
// concept fields take precedence over profile-level defaults for per-MID pricing,
// DBA, MCC, and bank details. location provides the physical address.
// entityMailing (optional) provides a separate legal/mailing address for all MIDs under the entity.

function buildFormPayload(
  profile: Record<string, any>,
  location: Record<string, any>,
  concept: Record<string, any>,
  primarySigner: Record<string, any>,
  additionalSigners: Record<string, any>[],
  entityMailing?: { street: string; city: string; state: string; zip: string } | null
): Record<string, unknown> {

  const signer = primarySigner || {};

  // Bank: concept-level account overrides location (e.g. bakery settles to different account)
  const bank = concept.bankDetails || location.bankDetails || {};
  const routing = bank.routingNumber || location.routingNumber || '';
  const account = bank.accountNumber || location.accountNumber || '';

  const taxId = cleanDigits(profile.taxId || '');
  const ssn = cleanDigits(signer.ssn || profile.ssn || '');
  const phone = cleanDigits(signer.corporatePhone || profile.corporatePhone || '');

  // Concept-level fields override profile-level for per-MID differentiation
  const pricingCategory = String(concept.pricingCategory || profile.pricingCategory || '1');
  const TIER_TO_METHOD: Record<string, string> = {
    'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS',
    'SELF_SWIPED': 'ICPLS', 'SELF_KEYED': 'ICPLS',
    'CASH_DISCOUNT': 'CLEAR', 'SELF_CASH_DISCOUNT': 'CLEAR',
  };
  const rawPricingMethod = concept.pricingMethod || profile.pricingMethod
    || TIER_TO_METHOD[(concept.pricingTier || profile.pricingTier || '').toUpperCase()]
    || 'ICPLS';
  const pricingMethod = rawPricingMethod.toUpperCase() === 'CASH_DISCOUNT' ? 'CLEAR' : rawPricingMethod;
  // Derive industryType from pricingCategory; only use concept.industryType if pricingCategory is also set
  const industryType = (concept.pricingCategory && concept.industryType)
    ? concept.industryType
    : mapIndustryType(pricingCategory);
  const mcc = concept.mccCode || profile.mccCode || '5999';
  const dbaName = concept.dbaName || location.dbaName || profile.legalName || '';
  const monthlyCardSales = Math.max(1, parseFloat(String(concept.monthlyCardSales || profile.monthlyCardSales || '6000')) || 6000);
  const rawAvg = parseFloat(String(concept.avgSaleAmount || profile.avgSaleAmount || '100')) || 100;
  const rawHighest = parseFloat(String(concept.highestTicketAmount || profile.highestTicketAmount || '200')) || 200;
  // MSPWare rule: average_sales and highest_ticket must be LESS THAN monthly_sales
  const cap = Math.max(monthlyCardSales - 1, 1);
  const avgSaleAmount = String(Math.min(rawAvg, cap));
  const highestTicketAmount = String(Math.min(rawHighest, cap));
  // MSPWare rule: delayed_delivery must be >= 1
  const rawDelay = parseInt(String(concept.deliveryDelayDays ?? profile.deliveryDelayDays ?? '0'), 10);
  const deliveryDelayDays = String(Math.max(rawDelay, 1));
  // cardPresentPct: treat null/undefined as 100 (in-person default), NOT 0
  const rawCpPct = concept.cardPresentPct != null ? concept.cardPresentPct : (profile.cardPresentPct != null ? profile.cardPresentPct : 100);
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
    // If entity has a separate mailing address, send it as the legal address
    ...(entityMailing?.street ? {
      has_legal_address: 'mailing',
      mailing_address_type: 'LGA',
      mailing_address: entityMailing.street,
      mailing_city: entityMailing.city,
      mailing_state_usa: sanitizeState(entityMailing.state),
      mailing_zipcode: entityMailing.zip,
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

    // ── Pricing ───────────────────────────────────────────────────────────────
    pricing_method: pricingMethod,
    pricing_category: pricingCategory,
    billing_method: 'N',
    annual_fee_start_date: nextMonthStart(),
    auth_pricing_program: '49999',
    all_markup_discount: '0.0000',
    all_markup_per_item: '0.000',
    all_card_auth_per_item: '0.050',
    intl_card_handling_fee: '0.60',
    tokenization_service_fee: '0.0000',
    tokenization_platform_fee: '0.0000',
    has_pin_debit: false,       // attempt to disable debit fields; template may override
    debit_auth_method: 'PNL',  // pinless — required when has_pin_debit=true (template default)
    debit_pricing_method: 'ICPLS',
    // is_firearm_verified: let template defaults apply
    // Per-network debit interchange fees required by template
    ACCL_per_auth: '0.00', ACCL_percent_fee: '0.0000', ACCL_transaction_fee: '0.00',
    AFFN_per_auth: '0.00', AFFN_percent_fee: '0.0000', AFFN_transaction_fee: '0.00',
    ALAS_per_auth: '0.00', ALAS_percent_fee: '0.0000', ALAS_transaction_fee: '0.00',
    CU24_per_auth: '0.00', CU24_percent_fee: '0.0000', CU24_transaction_fee: '0.00',
    INKL_per_auth: '0.00', INKL_percent_fee: '0.0000', INKL_transaction_fee: '0.00',
    MSTO_per_auth: '0.00', MSTO_percent_fee: '0.0000', MSTO_transaction_fee: '0.00',
    NETS_per_auth: '0.00', NETS_percent_fee: '0.0000', NETS_transaction_fee: '0.00',
    NYCE_per_auth: '0.00', NYCE_percent_fee: '0.0000', NYCE_transaction_fee: '0.00',
    POSD_per_auth: '0.00', POSD_percent_fee: '0.0000', POSD_transaction_fee: '0.00',
    PULSE_per_auth: '0.00', PULSE_percent_fee: '0.0000', PULSE_transaction_fee: '0.00',
    ITS_per_auth: '0.00', ITS_percent_fee: '0.0000', ITS_transaction_fee: '0.00',
    STAR_per_auth: '0.00', STAR_percent_fee: '0.0000', STAR_transaction_fee: '0.00',
    UPDBT_per_auth: '0.00', UPDBT_percent_fee: '0.0000', UPDBT_transaction_fee: '0.00',

    // ── Bank Accounts ─────────────────────────────────────────────────────────
    // Only send when both routing and account are present — empty strings fail MSPWare validation
    ...(routing && account ? {
      deposit_account_no: account,
      deposit_account_rtg: routing,
      deposit_account_type: bank.accountType === 'savings' ? 'SA' : 'CK',
    } : {}),

    // ── Statements ────────────────────────────────────────────────────────────
    statement_delivery_method: 'E',
    chargebacks_retrievals_format: 'WM',
    chargebacks_retrievals_email: signer.signerEmail || profile.signerEmail || '',

    // ── Additional required fields ────────────────────────────────────────────
    state_of_formation: location.businessState || profile.stateOfFormation || '',
    currently_processing: profile.currentlyProcessing ? 'Y' : 'N',
    ...(profile.currentlyProcessing ? {
      current_processor_name: profile.currentProcessorName || '',
    } : {}),
    seasonal_business: profile.isSeasonal ? 'Y' : 'N',
    refund_policy: profile.refundPolicy || 'R',  // R=refund within 30d, E=exchange, N=no refund
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, conceptIds, locationIds } = body;

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
    const [profiles, allConcepts, allLocs, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantProcessingConcept.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

    // ── Auto-create concepts for new merchants who have locations but no concepts yet ──
    // This covers the standard onboarding flow: merchant adds location(s) via the UI,
    // then clicks Submit on the verification page before the tree UI / migration creates concepts.
    let concepts_created_auto = 0;
    if (!allConcepts?.length && allLocs?.length) {
      console.log(`[submitToMSP] No concepts found — auto-creating from ${allLocs.length} location(s)`);
      for (const loc of allLocs) {
        try {
          await base44.asServiceRole.entities.MerchantProcessingConcept.create({
            locationId:      loc.id,
            corporateId,
            conceptName:     loc.dbaName || profile.legalName,
            dbaName:         loc.dbaName || profile.legalName,
            mccCode:         profile.mccCode || profile.mcc || '5999',
            industryType:    profile.industryClass ? industryClassToMSP(profile.industryClass) : 'RE',
            pricingCategory: '1',
            pricingMethod:   'ICPLS',
            monthlyCardSales:    parseFloat(String(profile.monthlyCardSales || '0')) || null,
            avgSaleAmount:       parseFloat(String(profile.avgSaleAmount || '0')) || null,
            highestTicketAmount: parseFloat(String(profile.highestTicketAmount || '0')) || null,
            cardPresentPct:      parseFloat(String(profile.cardPresentPct || '100')) || 100,
            applicationStepStatus: 'In Review',
          });
          concepts_created_auto++;
        } catch (err: any) {
          console.warn(`[submitToMSP] Could not auto-create concept for location ${loc.id}: ${err.message}`);
        }
      }
      // Re-fetch concepts now that we've created them
      const freshConcepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({ corporateId });
      allConcepts.push(...(freshConcepts || []));
    }

    if (!allConcepts?.length) return Response.json({ error: 'No processing concepts found and no locations to derive them from' }, { status: 404 });

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

    // Filter concepts if caller specified specific IDs
    let concepts = allConcepts;
    if (conceptIds?.length) {
      concepts = concepts.filter((c: any) => conceptIds.includes(c.id));
    } else if (locationIds?.length) {
      // Backward-compat: callers that pass locationIds get concepts for those locations
      concepts = concepts.filter((c: any) => locationIds.includes(c.locationId));
    }

    const primarySigner = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0] || {};
    const additionalSigners = signers?.filter((s: any) => !s.isPrimarySigner) || [];

    const results = [];
    let allSuccessful = true;

    for (const concept of concepts) {
      // ── Skip already-boarded concepts ────────────────────────────────────────
      if (['Pending MID', 'Active', 'Active (Existing)'].includes(concept.applicationStepStatus)) {
        results.push({
          conceptId: concept.id,
          locationId: concept.locationId,
          dbaName: concept.dbaName,
          status: 'skipped',
          reason: `Already ${concept.applicationStepStatus}`,
        });
        continue;
      }

      // ── Join to location for address + fallback bank ──────────────────────
      const location = resolveLocationAddress(locationMap[concept.locationId]);
      if (!location) {
        results.push({
          conceptId: concept.id,
          dbaName: concept.dbaName,
          status: 'error',
          error: `Location ${concept.locationId} not found`,
        });
        allSuccessful = false;
        continue;
      }

      try {
        // ── Step 1: Create draft application (skip if already has one, unless it was deleted) ────────
        let mspApplicationNo = concept.mspApplicationNo;

        // If we have a stored application number, verify it still exists in MSP.
        // If it was deleted from the MSP dashboard, clear it so we create a fresh draft.
        if (mspApplicationNo) {
          const checkRes = await fetch(`${mspBase}/applications/${mspApplicationNo}`, { headers: mspHeaders });
          if (checkRes.status === 404) {
            console.warn(`[submitToMSP] Application ${mspApplicationNo} not found in MSP (deleted?) — will create a new draft for "${concept.dbaName}"`);
            mspApplicationNo = null;
            await base44.asServiceRole.entities.MerchantProcessingConcept.update(concept.id, { mspApplicationNo: null });
          } else {
            console.log(`[submitToMSP] Reusing existing draft ${mspApplicationNo} for "${concept.dbaName}"`);
          }
        }

        if (!mspApplicationNo) {
          const isCashDiscount = (concept.pricingMethod || profile.pricingMethod || '').toUpperCase() === 'CASH_DISCOUNT';
          const templateNo = concept.mspTemplateNo || profile.mspTemplateNo || (isCashDiscount ? CD_TEMPLATE_NO : DEFAULT_TEMPLATE_NO);
          const createBody = {
            dba: concept.dbaName || location.dbaName || profile.legalName,
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
            console.error(`[submitToMSP] Failed to create application for "${concept.dbaName}":`, JSON.stringify(createData));
            await base44.asServiceRole.entities.MerchantProcessingConcept.update(concept.id, { applicationStepStatus: 'Error' });
            results.push({
              conceptId: concept.id,
              locationId: concept.locationId,
              dbaName: concept.dbaName,
              status: 'error',
              error: createData.error || createData.message || `HTTP ${createRes.status}`,
            });
            allSuccessful = false;
            continue;
          }

          mspApplicationNo = createData.merchantapplicationno;
          console.log(`[submitToMSP] Created application ${mspApplicationNo} for "${concept.dbaName}"`);

          // Persist application number immediately so it's trackable even if form fill fails
          await base44.asServiceRole.entities.MerchantProcessingConcept.update(concept.id, {
            mspApplicationNo: String(mspApplicationNo),
            applicationStepStatus: 'In Review',
          });
        }

        // ── Step 2: Fill form ─────────────────────────────────────────────────
        const entityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
        const formPayload = buildFormPayload(profile, location, concept, primarySigner, additionalSigners, entityMailing);
        console.log(`[submitToMSP] Filling form for application ${mspApplicationNo}:`, JSON.stringify(formPayload, null, 2));

        const formRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, {
          method: 'PUT',
          headers: mspHeaders,
          body: JSON.stringify(formPayload),
        });
        const formData = await formRes.json();
        console.log(`[submitToMSP] Form fill response ${formRes.status}:`, JSON.stringify(formData, null, 2));

        const percentComplete = formData?.percent_complete ?? null;
        const validationErrors = [
          ...(formData?.data_errors || []),
          ...(formData?.completion_errors || []),
          ...(formData?.rule_violations || []),
        ];

        // Log form fill issues but don't abort — template defaults may cover remaining fields,
        // and signApplication will re-fill + verify completion before creating the signing package.
        if (!formRes.ok) {
          console.error(`[submitToMSP] Form PUT HTTP error ${formRes.status} for ${mspApplicationNo}:`, JSON.stringify(formData));
        } else {
          console.log(`[submitToMSP] Form fill ${mspApplicationNo}: ${percentComplete ?? '?'}% complete, canSave=${formData?.canSave}, errors=${validationErrors.length}`);
        }

        // ── Step 3: Submit (only if MSP_SUBMIT_ENABLED=true) ──────────────────
        if (!submitEnabled) {
          results.push({
            conceptId: concept.id,
            locationId: concept.locationId,
            dbaName: concept.dbaName,
            status: 'draft_created',
            mspApplicationNo,
            percentComplete,
            validationErrors,
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
        console.log(`[submitToMSP] Submit response ${submitRes.status}:`, JSON.stringify(submitData, null, 2));

        if (submitRes.ok && submitData?.success) {
          await base44.asServiceRole.entities.MerchantProcessingConcept.update(concept.id, {
            applicationStepStatus: 'Pending MID',
          });
          results.push({
            conceptId: concept.id,
            locationId: concept.locationId,
            dbaName: concept.dbaName,
            status: 'submitted',
            mspApplicationNo,
            percentComplete,
          });
        } else {
          await base44.asServiceRole.entities.MerchantProcessingConcept.update(concept.id, { applicationStepStatus: 'Error' });
          results.push({
            conceptId: concept.id,
            locationId: concept.locationId,
            dbaName: concept.dbaName,
            status: 'submit_error',
            mspApplicationNo,
            error: submitData?.error || submitData?.message || `HTTP ${submitRes.status}`,
            rawSubmitResponse: submitData,
          });
          allSuccessful = false;
        }

      } catch (err: any) {
        console.error(`[submitToMSP] Exception for "${concept.dbaName}":`, err.message);
        await base44.asServiceRole.entities.MerchantProcessingConcept.update(concept.id, { applicationStepStatus: 'Error' });
        results.push({
          conceptId: concept.id,
          locationId: concept.locationId,
          dbaName: concept.dbaName,
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
      conceptsAutoCreated: concepts_created_auto,
      results,
    });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});