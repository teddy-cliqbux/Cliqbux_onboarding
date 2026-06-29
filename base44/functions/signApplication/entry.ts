import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── signApplication ──────────────────────────────────────────────────────────
// Packages ALL pending MSPWare applications for a corporateId for e-signature
// and returns signing URLs per concept, in order.
//
// Flow:
//   1. Load profile, signers, concepts, AND locations
//   2. Filter to signable concepts (have mspApplicationNo, not already Active)
//   3. If none signable, auto-create MSPWare draft applications for unsubmitted concepts
//   4. For each signable: GET /signatures → create package if needed → GET /signatures/link
//   5. Return ordered array of applications with signing URLs + overall state
//
// The UI uses this to show iframes sequentially — one agreement per concept.
// Poll by calling again with the same corporateId; allSigned flips true when done.
//
// POST /functions/signApplication
// Body: { corporateId }

// ─── Constants (shared with submitToMSP) ─────────────────────────────────────
const MSP_APP_TYPE = 24;           // Elavon US Application
const DEFAULT_TEMPLATE_NO = 6;    // Cliqbux Template Swipe Keyed (ICPLS)
const CD_TEMPLATE_NO = 154;       // Cliqbux Template Cash Discount
const DEFAULT_SALESPERSON_ID = 0;

// ─── Helpers (mirrored from submitToMSP) ─────────────────────────────────────

function mapOwnershipType(t: string): string {
  const map: Record<string, string> = {
    'SOLE_PROP':        'SP', 'SOLE_PROPRIETOR':  'SP',
    'LLC':              'LL', 'LLC_CORPORATION':  'LL', 'LLC_PARTNERSHIP':  'LL',
    'CORPORATION':      'CO', 'C_CORP':           'CO',
    'S_CORP':           'SS', 'SUB_S_CORP':       'SS',
    'PARTNERSHIP':      'PA', 'LIMITED_COMPANY':  'LL',
    'NON_PROFIT':       'NP', 'TRUST':            'T',
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

function nextMonthStart(): string {
  const now = new Date();
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const m = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function buildFormPayload(
  profile: Record<string, any>,
  location: Record<string, any>,
  concept: Record<string, any>,
  primarySigner: Record<string, any>,
  additionalSigners: Record<string, any>[],
  entityMailing?: { street: string; city: string; state: string; zip: string } | null
): Record<string, unknown> {
  const signer = primarySigner || {};
  const bank = concept.bankDetails || location.bankDetails || {};
  const routing = bank.routingNumber || location.routingNumber || '';
  const account = bank.accountNumber || location.accountNumber || '';
  const taxId = cleanDigits(profile.taxId || '');
  const ssn = cleanDigits(signer.ssn || profile.ssn || '');
  const phone = cleanDigits(signer.corporatePhone || profile.corporatePhone || '');
  const pricingCategory = String(concept.pricingCategory || profile.pricingCategory || '1');
  // Map pricingTier (UI enum) → MSPWare pricing_method when pricingMethod isn't set directly
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
  // (prevents mismatches like industryType=HT with pricingCategory=1/Retail)
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
  const intPct  = cnpPct > 0 ? String(profile.internetPct ?? 0) : '0';
  const motoPct = cnpPct > 0 ? String(profile.motoPct ?? Math.max(0, cnpPct - parseInt(intPct, 10))) : '0';
  const ownershipRaw = profile.ownershipType || profile.taxClassType || '';
  const ownershipType = mapOwnershipType(ownershipRaw);
  const isLLC = ownershipType === 'LL';
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
    ...(isLLC ? { llc_class: mapLlcClass(ownershipRaw) } : {}),
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
    cards_accepted: ['VISA', 'VISA_DEBIT', 'MASTERCARD', 'MASTERCARD_DEBIT', 'DISCOVER', 'AMEX'],
    card_acceptance_split: cardPresentPct >= 100 ? 'CP' : 'OMNI',
    mcc,
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
    is_firearm_verified: false,
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
    // Only send bank details when both routing and account are present
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

    // ── 1. Load profile, signers, concepts, AND locations ─────────────────────
    const [profiles, signers, allConcepts, allLocs] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantProcessingConcept.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

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

    // ── 2. Filter to signable concepts ────────────────────────────────────────
    const DONE_STATUSES = ['Active', 'Active (Existing)', 'Pending MID'];
    let signable = (allConcepts || []).filter((c: any) =>
      c.mspApplicationNo && !DONE_STATUSES.includes(c.applicationStepStatus)
    );

    // ── 3. Auto-create MSPWare draft applications if none exist yet ───────────
    // This handles the case where the user navigated directly to the signing step
    // without going through the banking step (where submitToMSP is normally called).
    if (signable.length === 0) {
      const needsDraft = (allConcepts || []).filter((c: any) =>
        !c.mspApplicationNo && !DONE_STATUSES.includes(c.applicationStepStatus)
      );

      if (needsDraft.length === 0 && (allConcepts || []).length === 0) {
        return Response.json({
          success: false,
          error: 'No processing concepts found.',
          hint: 'Please complete the locations and banking setup steps first.',
        });
      }

      if (needsDraft.length === 0) {
        // All concepts are already active/pending
        return Response.json({
          success: false,
          error: 'All applications are already active or pending.',
          hint: 'Your applications have already been submitted and are being processed.',
        });
      }

      console.log(`[signApplication] No signable concepts — auto-creating drafts for ${needsDraft.length} concept(s)`);

      const autoCreateErrors: string[] = [];

      for (const concept of needsDraft) {
        const location = locationMap[concept.locationId];
        if (!location) {
          const msg = `Concept "${concept.dbaName || concept.id}" has no matching location (locationId=${concept.locationId})`;
          console.warn(`[signApplication] ${msg}`);
          autoCreateErrors.push(msg);
          continue;
        }

        try {
          const isCashDiscount = (concept.pricingMethod || profile.pricingMethod || '').toUpperCase() === 'CASH_DISCOUNT';
          const templateNo = concept.mspTemplateNo || profile.mspTemplateNo || (isCashDiscount ? CD_TEMPLATE_NO : DEFAULT_TEMPLATE_NO);
          const createBody = {
            dba: concept.dbaName || location.dbaName || profile.legalName,
            merchantapplicationtypeno: MSP_APP_TYPE,
            salespersonid: salespersonId,
            templatemerchantapplicationno: templateNo,
          };

          console.log(`[signApplication] POST /applications for "${concept.dbaName}":`, JSON.stringify(createBody));

          const createRes = await fetch(`${mspBase}/applications`, {
            method: 'POST',
            headers: mspHeaders,
            body: JSON.stringify(createBody),
          });
          const createData = await createRes.json();
          console.log(`[signApplication] POST /applications response ${createRes.status}:`, JSON.stringify(createData));

          if (!createRes.ok || !createData.success) {
            const errMsg = createData?.error || createData?.message || `HTTP ${createRes.status}: ${JSON.stringify(createData)}`;
            console.error(`[signApplication] Failed to create draft for "${concept.dbaName}":`, errMsg);
            autoCreateErrors.push(`"${concept.dbaName}": ${errMsg}`);
            continue;
          }

          const mspApplicationNo = String(createData.merchantapplicationno);
          console.log(`[signApplication] Auto-created draft ${mspApplicationNo} for "${concept.dbaName}"`);

          // Persist immediately
          await base44.asServiceRole.entities.MerchantProcessingConcept.update(concept.id, {
            mspApplicationNo,
            applicationStepStatus: 'In Review',
          });
          concept.mspApplicationNo = mspApplicationNo;
          concept.applicationStepStatus = 'In Review';

          // Fill form
          const entityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
          const formPayload = buildFormPayload(profile, resolveLocationAddress(location), concept, primarySigner, additionalSigners, entityMailing);
          const formRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, {
            method: 'PUT',
            headers: mspHeaders,
            body: JSON.stringify(formPayload),
          });
          const formData = await formRes.json();
          console.log(`[signApplication] Form fill ${formRes.status} for ${mspApplicationNo}:`, JSON.stringify(formData));
        } catch (err: any) {
          console.error(`[signApplication] Exception auto-creating draft for concept ${concept.id}:`, err.message);
        }
      }

      // Re-filter after auto-creation
      signable = (allConcepts || []).filter((c: any) =>
        c.mspApplicationNo && !DONE_STATUSES.includes(c.applicationStepStatus)
      );

      if (signable.length === 0) {
        return Response.json({
          success: false,
          error: 'Unable to prepare signing documents.',
          hint: autoCreateErrors.length > 0
            ? `MSPWare errors: ${autoCreateErrors.join(' | ')}`
            : 'Could not create MSPWare draft applications. Check MSPWare API status and try again.',
          autoCreateErrors,
        });
      }
    }

    console.log(`[signApplication] corporateId=${corporateId} signable concepts: ${signable.length}`);

    // ── 4. Process each concept ───────────────────────────────────────────────
    const applications: any[] = [];

    for (const concept of signable) {
      const mspApplicationNo = concept.mspApplicationNo;
      const conceptName = concept.dbaName || concept.conceptName || `Concept ${mspApplicationNo}`;

      console.log(`[signApplication] Processing app ${mspApplicationNo} (${conceptName})`);

      // Check existing signing package
      const statusRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
        headers: mspHeaders,
      });
      const statusData = await statusRes.json();

      let packageExists = statusRes.ok && statusData?.success && statusData?.signers?.length > 0;

      // Check current form completion via GET first — template defaults may already satisfy all fields
      let refillPercentComplete: number | null = null;
      let refillErrors: string[] = [];
      if (!packageExists) {
        const getRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, { headers: mspHeaders });
        const getData = await getRes.json();
        // percent_complete may be a string from MSPWare — parse it
        const rawPct = getData?.percent_complete ?? getData?.validation?.percent_complete ?? null;
        refillPercentComplete = rawPct !== null ? Math.round(parseFloat(String(rawPct))) : null;
        const getErrors = [
          ...(getData?.completion_errors || getData?.validation?.errors?.completion || []),
          ...(getData?.data_errors       || getData?.validation?.errors?.data       || []),
          ...(getData?.rule_violations   || getData?.validation?.errors?.rules      || []),
        ].map((e: any) => (typeof e === 'string' ? e : e?.message || e?.description || e?.errors || JSON.stringify(e)));
        console.log(`[signApplication] GET form status for ${mspApplicationNo}: ${refillPercentComplete ?? '?'}% complete, ${getErrors.length} errors`);

        // Only re-fill if the form is not already at 100%
        if (refillPercentComplete !== 100) {
          const location = locationMap[concept.locationId];
          if (location) {
            const refillEntityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
          const formPayload = buildFormPayload(profile, resolveLocationAddress(location), concept, primarySigner, additionalSigners, refillEntityMailing);
            const refillRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, {
              method: 'PUT', headers: mspHeaders, body: JSON.stringify(formPayload),
            });
            const refillData = await refillRes.json();
            // After PUT, always re-check via GET for true completion (PUT response can be misleading)
            const getRes2 = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, { headers: mspHeaders });
            const getData2 = await getRes2.json();
            const rawPct2 = getData2?.percent_complete ?? getData2?.validation?.percent_complete ?? null;
            refillPercentComplete = rawPct2 !== null ? Math.round(parseFloat(String(rawPct2))) : null;
            refillErrors = [
              ...(getData2?.completion_errors || getData2?.validation?.errors?.completion || []),
              ...(getData2?.data_errors       || getData2?.validation?.errors?.data       || []),
              ...(getData2?.rule_violations   || getData2?.validation?.errors?.rules      || []),
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
            conceptName,
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

      // Get signing link for each signer; track primary
      let primarySigningUrl: string | null = null;
      const signerLinks: any[] = [];

      for (const s of signerList) {
        const email = s.emailAddress || s.email || '';
        if (!email) continue;

        const linkRes = await fetch(
          `${mspBase}/applications/${mspApplicationNo}/signatures/link?emailAddress=${encodeURIComponent(email)}`,
          { headers: mspHeaders }
        );
        const linkData = await linkRes.json();
        const link = linkData?.link || null;

        signerLinks.push({
          email,
          name: s.name || '',
          status: s.localstatus || s.status || 'unknown',
          signed: ['signed', 'complete', 'completed'].includes((s.localstatus || s.status || '').toLowerCase()),
          signingUrl: link,
        });

        if (email.toLowerCase() === primaryEmail.toLowerCase() && link) {
          primarySigningUrl = link;
        }
      }

      // Fallback: try primaryEmail directly if not found in signer list
      if (!primarySigningUrl) {
        const fallbackRes = await fetch(
          `${mspBase}/applications/${mspApplicationNo}/signatures/link?emailAddress=${encodeURIComponent(primaryEmail)}`,
          { headers: mspHeaders }
        );
        const fallbackData = await fallbackRes.json();
        primarySigningUrl = fallbackData?.link || null;
      }

      const appAllSigned = signerList.length > 0 && signerList.every((s: any) =>
        ['signed', 'complete', 'completed'].includes((s.localstatus || s.status || '').toLowerCase())
      );

      applications.push({
        mspApplicationNo,
        conceptName,
        signingUrl: primarySigningUrl,
        signers: signerLinks,
        allSigned: appAllSigned || overallSigned,
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