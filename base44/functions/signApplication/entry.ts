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
    'OWNER': 'OP', 'PROPRIETOR_OR_OWNER': 'OP',
    'PARTNER': 'PP', 'PARTNER_OR_PRINCIPAL': 'PP',
    'MANAGER': 'GM', 'GENERAL_MANAGER': 'GM',
    'CEO': 'CEO', 'CFO': 'CFO', 'COO': 'COO',
    'PRESIDENT': 'P', 'VP': 'VP', 'VICE_PRESIDENT': 'VP',
    'MANAGING_MEMBER': 'MM', 'DIRECTOR': 'D', 'OFFICER': 'O',
    'TREASURER': 'T', 'SECRETARY': 'S',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'OP';
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
  additionalSigners: Record<string, any>[]
): Record<string, unknown> {
  const signer = primarySigner || {};
  const bank = concept.bankDetails || location.bankDetails || {};
  const routing = bank.routingNumber || location.routingNumber || '';
  const account = bank.accountNumber || location.accountNumber || '';
  const taxId = cleanDigits(profile.taxId || '');
  const ssn = cleanDigits(signer.ssn || profile.ssn || '');
  const phone = cleanDigits(signer.corporatePhone || profile.corporatePhone || '');
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
    owner_state_usa: s.homeState || '',
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
    tin: taxId,
    ...((!taxId && ssn) ? { ssn } : {}),
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
    has_legal_address: 'business',
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
    deposit_account_no: account,
    deposit_account_rtg: routing,
    statement_delivery_method: 'E',
    chargebacks_retrievals_format: 'WM',
    chargebacks_retrievals_email: signer.signerEmail || profile.signerEmail || '',
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
          const formPayload = buildFormPayload(profile, location, concept, primarySigner, additionalSigners);
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
            error: `Application form incomplete: ${errMsg}`,
            hint: 'Ensure all required fields are filled (bank account, SSN, DOB, addresses).',
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