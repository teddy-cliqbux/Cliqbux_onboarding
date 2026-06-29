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
    'OWNER':               'OP',
    'PROPRIETOR_OR_OWNER': 'OP',
    'PARTNER':             'PP',
    'PARTNER_OR_PRINCIPAL':'PP',
    'MANAGER':             'GM',
    'GENERAL_MANAGER':     'GM',
    'CEO':                 'CEO',
    'CFO':                 'CFO',
    'COO':                 'COO',
    'PRESIDENT':           'P',
    'VP':                  'VP',
    'VICE_PRESIDENT':      'VP',
    'MANAGING_MEMBER':     'MM',
    'DIRECTOR':            'D',
    'OFFICER':             'O',
    'TREASURER':           'T',
    'SECRETARY':           'S',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'OP';
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

function buildFormPayload(
  profile: Record<string, any>,
  location: Record<string, any>,
  concept: Record<string, any>,
  primarySigner: Record<string, any>,
  additionalSigners: Record<string, any>[]
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
  const rawPricingMethod = concept.pricingMethod || profile.pricingMethod || 'ICPLS';
  const pricingMethod = rawPricingMethod.toUpperCase() === 'CASH_DISCOUNT' ? 'CLEAR' : rawPricingMethod;
  const industryType = concept.industryType || profile.industryType || mapIndustryType(pricingCategory);
  const mcc = concept.mccCode || profile.mccCode || '5999';
  const dbaName = concept.dbaName || location.dbaName || profile.legalName || '';
  const monthlyCardSales = String(concept.monthlyCardSales || profile.monthlyCardSales || '6000');
  const avgSaleAmount = String(concept.avgSaleAmount || profile.avgSaleAmount || '100');
  const highestTicketAmount = String(concept.highestTicketAmount || profile.highestTicketAmount || profile.avgSaleAmount || '200');
  const deliveryDelayDays = String(concept.deliveryDelayDays ?? profile.deliveryDelayDays ?? '0');

  const cardPresentPct = parseInt(String(concept.cardPresentPct ?? profile.cardPresentPct ?? '100'), 10);
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
    owner_state_usa: s.homeState || '',
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
    has_legal_address: 'business',

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
        owner_state_usa: signer.homeState || profile.homeState || '',
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
    monthly_sales: monthlyCardSales,
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

    // ── Bank Accounts ─────────────────────────────────────────────────────────
    // Only send when both routing and account are present — empty strings fail MSPWare validation
    ...(routing && account ? {
      deposit_account_no: account,
      deposit_account_rtg: routing,
      deposit_account_type: 'CK',   // CK = checking; SA = savings
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
      const location = locationMap[concept.locationId];
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

      // Resolve bank: concept-level first, then location-level
      const bank = concept.bankDetails || location.bankDetails || {};
      const routing = bank.routingNumber || location.routingNumber || '';
      const account = bank.accountNumber || location.accountNumber || '';

      if (!routing || !account) {
        results.push({
          conceptId: concept.id,
          locationId: concept.locationId,
          dbaName: concept.dbaName,
          status: 'skipped',
          reason: 'Missing bank account details',
        });
        continue;
      }

      try {
        // ── Step 1: Create draft application ─────────────────────────────────
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

        const mspApplicationNo = createData.merchantapplicationno;
        console.log(`[submitToMSP] Created application ${mspApplicationNo} for "${concept.dbaName}"`);

        // Persist application number immediately so it's trackable even if form fill fails
        await base44.asServiceRole.entities.MerchantProcessingConcept.update(concept.id, {
          mspApplicationNo: String(mspApplicationNo),
          applicationStepStatus: 'In Review',
        });

        // ── Step 2: Fill form ─────────────────────────────────────────────────
        const formPayload = buildFormPayload(profile, location, concept, primarySigner, additionalSigners);
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

        if (!formRes.ok || !formData?.canSave) {
          results.push({
            conceptId: concept.id,
            locationId: concept.locationId,
            dbaName: concept.dbaName,
            status: 'form_error',
            mspApplicationNo,
            percentComplete,
            validationErrors,
            rawFormResponse: formData,
          });
          allSuccessful = false;
          continue;
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