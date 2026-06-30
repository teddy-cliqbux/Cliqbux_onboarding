import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Debug: create a fresh app, fill it with real merchant data, and return the FULL raw form GET response
// so we can see exactly what MSPWare thinks is incomplete.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, appNo: existingAppNo } = body;

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const salespersonId = parseInt(Deno.env.get('MSP_SALESPERSON_ID') || '0', 10);
    const headers = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Accept':    'application/json',
      'Content-Type': 'application/json',
    };

    let appNo = existingAppNo;

    // If no appNo provided, create a fresh one
    if (!appNo) {
      const createRes = await fetch(`${mspBase}/applications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          dba: 'Debug Raw Form Test',
          merchantapplicationtypeno: 24,
          salespersonid: salespersonId,
          templatemerchantapplicationno: 6,
        }),
      });
      const createData = await createRes.json();
      if (!createData.success) {
        return Response.json({ error: 'create_failed', createData, createStatus: createRes.status });
      }
      appNo = createData.merchantapplicationno;
    }

    // GET /form BEFORE any fill — full raw text
    const preRes = await fetch(`${mspBase}/applications/${appNo}/form`, { headers });
    const preText = await preRes.text();

    // GET /status
    const statusRes = await fetch(`${mspBase}/applications/${appNo}/status`, { headers });
    const statusData = await statusRes.json();

    // GET /applications/{appNo} - full app record
    const appRes = await fetch(`${mspBase}/applications/${appNo}`, { headers });
    const appData = await appRes.json();

    let fillResult = null;
    if (corporateId) {
      // Load real merchant data and fill the form
      const [profiles, signers, allLocs] = await Promise.all([
        base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
        base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
        base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      ]);
      const profile = profiles?.[0];
      const signer = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0] || {};
      const location = allLocs?.[0] || {};
      const bank = location.bankDetails || {};

      const payload: any = {
        full_dba_name: location.dbaName || profile?.legalName || 'Debug DBA',
        legal_dba_name: profile?.legalName || '',
        products_or_services: profile?.productDescription || 'Retail goods',
        year_business_established: String(profile?.establishmentYear || '2020'),
        ownership_years: String(profile?.currentOwnershipYears || '1'),
        ownership_months: String(profile?.currentOwnershipMonths || '0'),
        ownership_type: 'CO',
        tin: (profile?.taxId || '').replace(/\D/g, '') || undefined,
        country_formation: 'USA',
        country_operations: 'USA',
        industry_type: 'RE',
        contact_first_name: signer.firstName || profile?.firstName || '',
        contact_last_name: signer.lastName || profile?.lastName || '',
        business_phone: (signer.corporatePhone || profile?.corporatePhone || '').replace(/\D/g, ''),
        customer_service_phone: (signer.corporatePhone || profile?.corporatePhone || '').replace(/\D/g, ''),
        business_email: signer.signerEmail || profile?.signerEmail || '',
        business_address_type: 'BSA',
        business_address: location.businessStreet || location.businessAddress || '',
        business_city: location.businessCity || '',
        business_state_usa: location.businessState || '',
        business_zipcode: location.businessZip || '',
        has_legal_address: 'business',
        owners: [{
          owner_responsible_party: true,
          owner_personal_guarantee: true,
          principal_sign_agreement: true,
          ownership_percent: String(signer.ownershipPercentage || profile?.ownershipPercentage || '100'),
          owner_title: 'OP',
          owner_firstname: signer.firstName || profile?.firstName || '',
          owner_middlename: '',
          owner_lastname: signer.lastName || profile?.lastName || '',
          owner_dob: signer.dobYear ? `${signer.dobYear}-${String(signer.dobMonth).padStart(2,'0')}-${String(signer.dobDay).padStart(2,'0')}` : '',
          owner_phone: (signer.corporatePhone || profile?.corporatePhone || '').replace(/\D/g, ''),
          owner_email: signer.signerEmail || profile?.signerEmail || '',
          owner_country: 'USA',
          owner_address_type: 'PRA',
          owner_address: signer.homeStreet || profile?.homeStreet || '',
          owner_city: signer.homeCity || profile?.homeCity || '',
          owner_state_usa: signer.homeState || profile?.homeState || location.businessState || '',
          owner_zipcode: signer.homeZip || profile?.homeZip || '',
          owner_citizenship_country_1: 'USA',
          owner_id_type: 'SSN',
          owner_id_number: (signer.ssn || profile?.ssn || '').replace(/\D/g, ''),
        }],
        has_intermediary_businesses: false,
        beneficial_ownership_exemption: 'NON',
        owner_confirmed: true,
        annual_revenue: String(parseFloat(String(profile?.annualRevenue || '72000')) || 72000),
        monthly_sales: String(parseFloat(String(profile?.monthlyCardSales || '6000')) || 6000),
        average_sales: '100',
        highest_ticket: '200',
        freq_highest_average_ticket: '24',
        cp_percent: '100',
        cnp_percent: '0',
        int_percent: '0',
        moto_percent: '0',
        delayed_delivery: '1',
        cards_accepted: ['VISA', 'VISA_DEBIT', 'MASTERCARD', 'MASTERCARD_DEBIT', 'DISCOVER', 'AMEX'],
        card_acceptance_split: 'CP',
        mcc: profile?.mccCode || '5999',
        pricing_method: 'ICPLS',
        pricing_category: '1',
        billing_method: 'N',
        annual_fee_start_date: '2026-08-01',
        auth_pricing_program: '49999',
        all_markup_discount: '0.0000',
        all_markup_per_item: '0.000',
        all_card_auth_per_item: '0.050',
        intl_card_handling_fee: '0.60',
        tokenization_service_fee: '0.0000',
        tokenization_platform_fee: '0.0000',
        has_pin_debit: false,
        debit_auth_method: 'PNL',
        debit_pricing_method: 'ICPLS',
        // is_firearm_verified: OMIT — any value (yes, no, false, N) overrides the template and drops form below 100%. See AGENTS.md Critical Lesson #1.
        ACCL_per_auth: '0.00', ACCL_percent_fee: '0.0000', ACCL_transaction_fee: '0.00',
        AFFN_per_auth: '0.00', AFFN_percent_fee: '0.0000', AFFN_transaction_fee: '0.00',
        statement_delivery_method: 'E',
        chargebacks_retrievals_format: 'WM',
        chargebacks_retrievals_email: signer.signerEmail || profile?.signerEmail || '',
        state_of_formation: location.businessState || '',
        currently_processing: 'N',
        seasonal_business: 'N',
        refund_policy: 'R',
        ...(bank.routingNumber && bank.accountNumber ? {
          deposit_account_no: bank.accountNumber,
          deposit_account_rtg: bank.routingNumber,
          deposit_account_type: bank.accountType === 'savings' ? 'SA' : 'CK',
        } : {}),
      };

      const fillRes = await fetch(`${mspBase}/applications/${appNo}/form`, {
        method: 'PUT', headers, body: JSON.stringify(payload),
      });
      const fillText = await fillRes.text();

      // GET again after fill
      const postFillRes = await fetch(`${mspBase}/applications/${appNo}/form`, { headers });
      const postFillText = await postFillRes.text();

      // Try signatures
      const sigRes = await fetch(`${mspBase}/applications/${appNo}/signatures`, {
        method: 'POST', headers, body: JSON.stringify({ sendEmail: false }),
      });
      const sigText = await sigRes.text();

      fillResult = {
        fillStatus: fillRes.status,
        fillResponse: fillText.slice(0, 5000),
        postFillStatus: postFillRes.status,
        postFillResponse: postFillText.slice(0, 5000),
        signaturesStatus: sigRes.status,
        signaturesResponse: sigText.slice(0, 3000),
        payloadSent: payload,
      };
    }

    return Response.json({
      appNo,
      preFormStatus: preRes.status,
      preFormResponse: preText.slice(0, 5000),
      statusData,
      appData,
      fillResult,
    });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 5).join(' | ') }, { status: 500 });
  }
});