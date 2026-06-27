import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── MSPWare / PulsePoint Constants ───────────────────────────────────────────
// Application type 24 = "Elavon US Application" in this account
const MSP_APP_TYPE = 24;
// Template 6 = "Cliqbux Template Swipe Keyed" — holds default pricing/fees/equipment
// Override per-merchant via profile.mspTemplateNo if needed
const DEFAULT_TEMPLATE_NO = 6;

// ─── Value Mappings ───────────────────────────────────────────────────────────

// Maps our internal ownershipType / taxClassType → MSPWare ownership_type codes
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
    'LLC':              'D',   // default: single-member disregarded entity
    'LLC_PARTNERSHIP':  'P',   // multi-member taxed as partnership
    'LLC_CORPORATION':  'C',   // elected to be taxed as corporation
  };
  return map[t?.toUpperCase?.()] || map[t] || 'D';
}

// Maps our internal titleType → MSPWare owner_title codes
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
    '1':  'RE',   // Retail (confirmed valid)
    '2':  'HT',   // Hotel/Lodging
    '4':  'SP',   // Supermarket (confirmed valid)
    '5':  'ARU',  // ARU
    '6':  'MS',   // MOTO/Internet
    '7':  'RS',   // Restaurant (confirmed valid)
    '13': 'RE',   // Omni Commerce → Retail
  };
  return map[pricingCategory] || 'RE';
}

function cleanDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function formatDob(year: string, month: string, day: string): string {
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Returns first day of next calendar month as YYYY-MM-DD
function nextMonthStart(): string {
  const now = new Date();
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const m = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

// ─── Form Payload Builder ─────────────────────────────────────────────────────

function buildFormPayload(
  profile: Record<string, any>,
  location: Record<string, any>,
  primarySigner: Record<string, any>,
  additionalSigners: Record<string, any>[]
): Record<string, unknown> {

  const signer = primarySigner || {};
  const routing = location.bankDetails?.routingNumber || location.routingNumber || '';
  const account = location.bankDetails?.accountNumber || location.accountNumber || '';
  const taxId = cleanDigits(profile.taxId || '');
  const ssn = cleanDigits(signer.ssn || profile.ssn || '');
  const phone = cleanDigits(signer.corporatePhone || profile.corporatePhone || '');

  const cardPresentPct = parseInt(String(profile.cardPresentPct || '100'), 10);
  const cnpPct = 100 - cardPresentPct;
  const intPct = cnpPct > 0 ? String(profile.internetPct ?? cnpPct) : '0';

  const ownershipRaw = profile.ownershipType || profile.taxClassType || '';
  const ownershipType = mapOwnershipType(ownershipRaw);
  const isLLC = ownershipType === 'LL';

  // Pricing/industry — use profile fields if set, otherwise retail defaults
  const pricingCategory = String(profile.pricingCategory || '1');
  const pricingMethod = profile.pricingMethod || 'ICPLS';
  const industryType = profile.industryType || mapIndustryType(pricingCategory);

  const annualRevenue = String(
    profile.annualRevenue || (parseInt(String(profile.monthlyCardSales || '6000'), 10) * 12)
  );

  // Build additional owners array
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
    full_dba_name: location.dbaName || profile.legalName || '',
    legal_dba_name: profile.legalName || '',
    products_or_services: profile.productDescription || 'Retail goods and services',
    year_business_established: String(profile.establishmentYear || new Date().getFullYear() - 3),
    ownership_years: String(profile.currentOwnershipYears || '1'),
    ownership_months: String(profile.currentOwnershipMonths || '0'),
    ownership_type: ownershipType,
    tin: taxId,
    // SSN only sent for sole props (when no EIN)
    ...((!taxId && ssn) ? { ssn } : {}),
    // LLC tax classification — only required when ownership_type = 'LL'
    ...(isLLC ? { llc_class: mapLlcClass(ownershipRaw) } : {}),
    // Country fields
    country_formation: 'USA',
    country_operations: 'USA',
    // Industry
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
    has_legal_address: 'business',   // 'same' is not a valid option

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
    monthly_sales: String(profile.monthlyCardSales || '6000'),
    average_sales: String(profile.avgSaleAmount || '100'),
    highest_ticket: String(profile.highestTicketAmount || profile.avgSaleAmount || '200'),
    freq_highest_average_ticket: String(profile.highestTicketFrequency || '24'),
    cp_percent: String(cardPresentPct),
    cnp_percent: String(cnpPct),
    int_percent: intPct,
    delayed_delivery: String(profile.deliveryDelayDays || '0'),

    // ── Card Acceptance ───────────────────────────────────────────────────────
    cards_accepted: ['VISA', 'VISA_DEBIT', 'MASTERCARD', 'MASTERCARD_DEBIT', 'DISCOVER', 'AMEX'],
    card_acceptance_split: cardPresentPct >= 100 ? 'CP' : 'OMNI',

    // ── Industry / MCC ────────────────────────────────────────────────────────
    // MSPWare MCC field uses Elavon's MCC codes (e.g. "5814", "5411A", "5999")
    // profile.mcc should store the merchant's MCC; defaults to 5999 (misc retail)
    mcc: profile.mcc || '5999',

    // ── Pricing ───────────────────────────────────────────────────────────────
    pricing_method: pricingMethod,
    pricing_category: pricingCategory,
    billing_method: 'N',
    annual_fee_start_date: nextMonthStart(),
    // Auth/IC+ pricing fields — account-level constants for Cliqbux
    auth_pricing_program: '49999',
    all_markup_discount: '0.0000',
    all_markup_per_item: '0.000',
    all_card_auth_per_item: '0.050',
    intl_card_handling_fee: '0.60',
    tokenization_service_fee: '0.0000',
    tokenization_platform_fee: '0.0000',

    // ── Bank Accounts ─────────────────────────────────────────────────────────
    deposit_account_no: account,
    deposit_account_rtg: routing,

    // ── Statements ────────────────────────────────────────────────────────────
    statement_delivery_method: 'E',
    chargebacks_retrievals_format: 'WM',   // 'E' is not a valid option
    chargebacks_retrievals_email: signer.signerEmail || profile.signerEmail || '',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { corporateId } = await req.json();

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

    const [profiles, allLocs, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    if (!allLocs?.length) return Response.json({ error: 'No locations found' }, { status: 404 });

    const primarySigner = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0] || {};
    const additionalSigners = signers?.filter((s: any) => !s.isPrimarySigner) || [];

    const results = [];
    let allSuccessful = true;

    for (const location of allLocs) {
      // Skip locations already boarded
      if (['Pending MID', 'Active'].includes(location.applicationStepStatus)) {
        results.push({ locationId: location.id, dbaName: location.dbaName, status: 'skipped', reason: `Already ${location.applicationStepStatus}` });
        continue;
      }

      const routing = location.bankDetails?.routingNumber || location.routingNumber || '';
      const account = location.bankDetails?.accountNumber || location.accountNumber || '';

      if (!routing || !account) {
        results.push({ locationId: location.id, dbaName: location.dbaName, status: 'skipped', reason: 'Missing bank account details' });
        continue;
      }

      try {
        // ── Step 1: Create draft application ──────────────────────────────────
        const templateNo = profile.mspTemplateNo || DEFAULT_TEMPLATE_NO;
        const createBody = {
          dba: location.dbaName || profile.legalName,
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
          console.error(`[submitToMSP] Failed to create application for "${location.dbaName}":`, JSON.stringify(createData));
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, { applicationStepStatus: 'Error' });
          results.push({ locationId: location.id, dbaName: location.dbaName, status: 'error', error: createData.error || createData.message || `HTTP ${createRes.status}` });
          allSuccessful = false;
          continue;
        }

        const mspApplicationNo = createData.merchantapplicationno;
        console.log(`[submitToMSP] Created application ${mspApplicationNo} for "${location.dbaName}"`);

        // Store application number immediately so we can track it even if form fill fails
        await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
          mspApplicationNo: String(mspApplicationNo),
          applicationStepStatus: 'In Review',
        });

        // ── Step 2: Fill form ─────────────────────────────────────────────────
        const formPayload = buildFormPayload(profile, location, primarySigner, additionalSigners);
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
            locationId: location.id,
            dbaName: location.dbaName,
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
            locationId: location.id,
            dbaName: location.dbaName,
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
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Pending MID',
          });
          results.push({
            locationId: location.id,
            dbaName: location.dbaName,
            status: 'submitted',
            mspApplicationNo,
            percentComplete,
          });
        } else {
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, { applicationStepStatus: 'Error' });
          results.push({
            locationId: location.id,
            dbaName: location.dbaName,
            status: 'submit_error',
            mspApplicationNo,
            error: submitData?.error || submitData?.message || `HTTP ${submitRes.status}`,
            rawSubmitResponse: submitData,
          });
          allSuccessful = false;
        }

      } catch (err) {
        console.error(`[submitToMSP] Exception for "${location.dbaName}":`, err.message);
        await base44.asServiceRole.entities.MerchantLocations.update(location.id, { applicationStepStatus: 'Error' });
        results.push({ locationId: location.id, dbaName: location.dbaName, status: 'error', error: err.message });
        allSuccessful = false;
      }
    }

    return Response.json({
      success: allSuccessful,
      submitEnabled,
      corporateId,
      results,
    });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});
