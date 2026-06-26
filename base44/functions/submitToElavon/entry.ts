import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Cliqbux Partner Constants ────────────────────────────────────────────────
const PROFILE_CODE              = "PAPI_USA_CLIQBUX1";
const REFERRER_NAME             = "PAPI_USA_CLIQBUX";
const CLIENT_ID                 = "PAHCLIQBUX";
const CLIENT_GROUP_NUMBER       = "17";
const SALES_REP_CODE            = "45000";
const PARENT_ENTITY             = "46408";
const MONETARY_PRICING_PROGRAM  = "145";
const AUTH_PRICING_PROGRAM      = "49999";

// ─── Shared Helpers ───────────────────────────────────────────────────────────
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function toMonthAbbr(month: string | number): string {
  const idx = parseInt(String(month), 10) - 1;
  return (idx >= 0 && idx < 12) ? MONTHS[idx] : 'JAN';
}

function toStateCode(state: string): string {
  return state ? `USA_${state.toUpperCase().replace(/^USA_/, '')}` : 'USA_TN';
}

function parsePhone(phone: string) {
  const d = (phone || '').replace(/\D/g, '');
  return { intlCode: '1', areaCode: d.slice(0, 3) || '000', number: d.slice(3, 10) || '0000000' };
}

function buildPrincipal(profile: Record<string, string>, signer?: Record<string, string>) {
  const src = signer || profile;
  const phone = parsePhone(src.corporatePhone || profile.corporatePhone || '');
  return {
    name: { firstName: src.firstName || profile.firstName || 'UNKNOWN', lastName: src.lastName || profile.lastName || 'UNKNOWN' },
    contactInfo: {
      address: {
        streetName: src.homeStreet || profile.homeStreet || '',
        city: src.homeCity || profile.homeCity || '',
        postCode: src.homeZip || profile.homeZip || '',
        country: 'USA',
        state: toStateCode(src.homeState || profile.homeState || ''),
        classification: 'PHYSICAL_RESIDENTIAL_ADDRESS'
      },
      phone, mobile: {}, fax: {},
      emailAddress: src.signerEmail || profile.signerEmail || ''
    },
    dob: {
      year: parseInt(src.dobYear || profile.dobYear || '1990', 10),
      month: toMonthAbbr(src.dobMonth || profile.dobMonth || '1'),
      day: parseInt(src.dobDay || profile.dobDay || '1', 10)
    },
    positions: {
      SOLE_PROP: !!(src.isSoleProp),
      BENEFICIAL_OWNER: src.isBeneficialOwner !== false,
      AUTHORIZED_SIGNER: !!(src.isAuthorizedSigner)
    },
    ownershipPct: String(src.ownershipPercentage || profile.ownershipPercentage || '100'),
    ids: [{ idType: src.idType || 'ID_CARD', idNumber: src.idNumber || src.ssn || '', expiryDate: {} }],
    titleType: src.titleType || profile.titleType || 'OWNER',
    signingPersonalGuarantee: true,
    responsibleParty: true,
    residingCountry: 'USA', primaryNationality: 'USA',
    documentaryInfo: {
      documentary: !!(src.idNumber),
      documentaryVerifier: 'CUSTOMER', documentaryIssuer: 'USA',
      documentaryType: src.idType || 'DRIVER_LICENSE',
      idNumber: src.idNumber || '',
      issueDate: src.idIssueYear ? { year: parseInt(src.idIssueYear, 10), month: toMonthAbbr(src.idIssueMonth || '1'), day: parseInt(src.idIssueDay || '1', 10) } : {},
      expiryDate: src.idExpiryYear ? { year: parseInt(src.idExpiryYear, 10), month: toMonthAbbr(src.idExpiryMonth || '1'), day: parseInt(src.idExpiryDay || '1', 10) } : {},
      issuingState: toStateCode(src.idIssuingState || src.homeState || profile.homeState || '')
    },
    alternateAddressInfo: { documentNeeded: false },
    usPerson: true
  };
}

function buildBusinessInfo(profile: Record<string, string>, location: Record<string, string>) {
  const stateCode = toStateCode(location.businessState || '');
  const taxDigits = (profile.taxId || '').replace(/\D/g, '');
  const addr = {
    streetName: location.businessStreet || location.businessAddress || '',
    city: location.businessCity || '',
    postCode: location.businessZip || '',
    country: 'USA', state: stateCode, classification: 'BUSINESS_STREET_ADDRESS'
  };
  return {
    dbaName: location.dbaName || profile.legalName || '',
    dbaNameExtended: location.dbaName || profile.legalName || '',
    businessAddress: addr,
    legalName: profile.legalName || '',
    legalNameExtended: profile.legalName || '',
    additionalAddresses: { LEGAL: addr },
    ownershipType: profile.ownershipType || 'LIMITED_COMPANY',
    taxID: taxDigits,
    taxClassType: profile.taxClassType || 'CORPORATION',
    industryClass: profile.industryClass || 'RETAIL',
    productDescription: profile.productDescription || 'Retail goods and services',
    mccCode: (profile.mccCode || '5999') + 'J',
    establishmentYear: profile.establishmentYear || String(new Date().getFullYear() - 3),
    currentOwnershipYears: profile.currentOwnershipYears || '1',
    currentOwnershipMonths: profile.currentOwnershipMonths || '0',
    communicationLanguage: 'en', posLanguage: 'en',
    associationCodes: [], signDate: {}, pciInfo: {},
    countryOfOrigin: 'USA', ownerExemptionType: 'NONE', countryOfPrimaryOperation: 'USA',
    legalStatus: 'GOVERNMENT_BUSINESS_LICENSE',
    verifications: {
      LEGAL: {
        documentary: true, issuingCountry: 'USA', issuingState: stateCode,
        idNumber: taxDigits,
        issueDate: { year: parseInt(profile.establishmentYear || '2010', 10), month: 'JAN', day: 1 },
        expiryDate: { year: 2099, month: 'DEC', day: 31 },
        documentType: 'GOVERNMENT_BUSINESS_LICENSE'
      }
    }
  };
}

function buildFinancialInfo(profile: Record<string, string>) {
  return {
    avgSaleAmount: profile.avgSaleAmount || '100',
    monthlyCardSales: profile.monthlyCardSales || '6000',
    annualRevenue: profile.annualRevenue || '50000',
    highestTicketAmount: profile.highestTicketAmount || profile.avgSaleAmount || '200',
    highestTicketFrequency: profile.highestTicketFrequency ? Number(profile.highestTicketFrequency) : 24,
    fundingCurrency: 'USD',
    cardPresentAcceptancePercent: profile.cardPresentPct || '100',
    internetAcceptancePercent: profile.internetPct || '0',
    motoAcceptancePercent: profile.motoPct || '0',
    monthsClosed: [],
    customerServicePhone: parsePhone(profile.corporatePhone || '')
  };
}

function buildBankAccounts(location: Record<string, string>) {
  const routing = location.bankDetails?.routingNumber || location.routingNumber || '';
  const account = location.bankDetails?.accountNumber || location.accountNumber || '';
  // tapeId "20" is the board value (vs "14" used in listdocuments/getdocuments)
  return {
    DEPOSIT: { fundingMethod: 'GROSS', accountNumber: account, sortCode: routing, country: 'USA', trueDaily: false, tapeId: '20' },
    CHARGEBACK: { accountNumber: account, sortCode: routing, country: 'USA' },
    BILLING: { accountNumber: account, sortCode: routing, country: 'USA' }
  };
}

function buildCardPricing(pricingTier: string) {
  const isCD = pricingTier === 'CASH_DISCOUNT';
  const std = isCD ? 0 : 0.05;
  const stdItem = isCD ? 0 : 0.015;
  const amex = isCD ? 0 : 0.1;
  const amexItem = isCD ? 0 : 0.1;
  const makeCharge = (cardType: string, rate: number, item: number, hasIntl = true) => ({
    cardType, authorizationFee: 0.03,
    pricingTiers: {
      QUALIFIED: { discountRate: rate, discountPerItem: item },
      ...(hasIntl ? { INTERNATIONAL: { discountRate: 0, discountPerItem: 0 } } : {})
    }
  });
  return {
    pricingMethod: 'INTERCHANGE_PLUS', pricingCategory: 'RETAIL',
    amexAcceptingInfo: { isExisting: false },
    cardCharges: [
      makeCharge('AMERICAN_EXPRESS', amex, amexItem),
      makeCharge('DISCOVER', std, stdItem),
      makeCharge('MASTERCARD', std, stdItem),
      makeCharge('MASTERCARD_DEBIT', std, stdItem),
      makeCharge('UNIONPAY_CREDIT', std, stdItem, false),
      makeCharge('VISA', std, stdItem),
      makeCharge('VISA_DEBIT', std, stdItem),
    ],
    exceptionCharges: []
  };
}

function buildEquipmentInfo() {
  return {
    equipmentItems: [{ code: 'D500U', quantity: 1, pricingItems: [{ amount: 0, purchaseType: 'PURCHASE' }], itemSettings: { securityLevel: 'SAFE_T', connectionType: 'STANDARD_IP', services: {}, options: [] }, exceptionItems: [] }],
    terminalServices: [{ type: 'TERMINAL_AUTO_CLOSE', serviceSpecifics: '23;30;EST (UTC-05:00)' }],
    trainingType: 'TRAINING', network: 'ELAVON', fuseboxInfo: {}
  };
}

function buildScarecrowApplication(profile: Record<string, string>, location: Record<string, string>, primarySigner: Record<string, string>, additionalSigners: Record<string, string>[]) {
  const principal = buildPrincipal(profile, primarySigner);
  const businessInfo = buildBusinessInfo(profile, location);
  const financialInfo = buildFinancialInfo(profile);
  const bankAccounts = buildBankAccounts(location);
  const cardPricing = buildCardPricing(profile.pricingTier);
  const shortName = (profile.legalName || 'MERCH').replace(/[^A-Z0-9]/gi, '').slice(0, 8).toUpperCase();
  const additionalShareholders = additionalSigners.map(s => buildPrincipal(profile, s));

  return {
    referrerName: REFERRER_NAME,
    clientId: CLIENT_ID,
    clientGroupNumber: CLIENT_GROUP_NUMBER,
    uniqueId: `CLIQBUX-${Date.now()}`,
    country: 'USA',
    principal,
    businessInfo,
    financialInfo,
    salesRepCode: SALES_REP_CODE,
    additionalShareholders,
    contact: {
      name: principal.name,
      contactInfo: { address: {}, phone: principal.contactInfo.phone, mobile: {}, fax: {}, emailAddress: principal.contactInfo.emailAddress },
      dob: {}, positions: {}, ids: []
    },
    bankAccounts,
    cardPricing,
    fees: [{ type: '92438', quantity: 1, amount: 0, frequency: 'MONTHLY' }],
    monetaryPricingProgram: MONETARY_PRICING_PROGRAM,
    authenticatePricingProgram: AUTH_PRICING_PROGRAM,
    parentEntity: PARENT_ENTITY,
    shortName,
    fraudCheckResult: {},
    siteSurvey: { siteSurveyConducted: false },
    dynamicCurrencyConversion: {},
    billingStatement: { type: 'SURCHARGE_TIERED', media: 'DYNAMIC_MERCHANT_REPORTING' },
    fundingStatement: {},
    electronicStatement: {},
    billingMethod: 'GROSS',
    valueAddedInfo: { valueAdds: {} },
    equipmentInfo: buildEquipmentInfo(),
    selfBoardedExternal: true,
    distributions: {
      CHARGEBACK: { method: 'BUSINESS', addressType: 'BUSINESS' },
      RETRIEVAL: { method: 'BUSINESS', addressType: 'BUSINESS' }
    },
    additionalLocationInfo: {},
    signedDate: {},
    signedType: 'ELECTRONIC',
    intermediaryOwnerInfo: { intermediaryOwners: [], additionalIntermediateOwners: false }
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { corporateId } = await req.json();

    if (!corporateId) return Response.json({ error: 'corporateId is required' }, { status: 400 });

    const elavonBase = (Deno.env.get('ELAVON_ENDPOINT') || 'https://uat-buynow-na.elavon.net').replace(/\/api\/.*$/, '');
    const auth = btoa(`${Deno.env.get('ELAVON_USERNAME')}:${Deno.env.get('ELAVON_PASSWORD')}`);

    const [profiles, allLocs, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);

    const profile = profiles[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    if (!allLocs?.length) return Response.json({ error: 'No locations found' }, { status: 404 });

    const primarySigner = signers?.find((s: Record<string, boolean>) => s.isPrimarySigner) || signers?.[0] || {};
    const additionalSigners = signers?.filter((s: Record<string, boolean>) => !s.isPrimarySigner) || [];

    const results = [];
    let allSuccessful = true;

    for (const location of allLocs) {
      const routing = location.bankDetails?.routingNumber || location.routingNumber || '';
      const account = location.bankDetails?.accountNumber || location.accountNumber || '';

      if (!routing || !account) {
        results.push({ locationId: location.id, dbaName: location.dbaName, status: 'skipped', reason: 'Missing bank account details' });
        continue;
      }

      const scarecrowApplication = buildScarecrowApplication(profile, location, primarySigner, additionalSigners);
      const payload = { profileCode: PROFILE_CODE, scarecrowApplication };

      console.log(`[submitToElavon] Boarding "${location.dbaName}" (${corporateId})`, JSON.stringify(payload, null, 2));

      try {
        const res = await fetch(`${elavonBase}/api/v4/board`, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        });

        const resText = await res.text();
        let resData: Record<string, unknown> = {};
        try { resData = JSON.parse(resText); } catch { resData = { raw: resText.slice(0, 2000) }; }

        console.log(`[submitToElavon] Response ${res.status} for "${location.dbaName}":`, JSON.stringify(resData, null, 2));

        if (res.ok) {
          // BoardingResponse fields: merchantId (MID), boardingId (AWB/chain ref)
          const elavonMID = resData?.merchantId || resData?.mid || resData?.MID || null;
          const boardingId = resData?.boardingId || resData?.chainId || null;
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, { applicationStepStatus: 'Approved', elavonMID, boardingId });
          results.push({ locationId: location.id, dbaName: location.dbaName, status: 'success', elavonMID, boardingId, httpStatus: res.status });
        } else {
          console.error(`[submitToElavon] ERROR "${location.dbaName}" HTTP ${res.status}:`, JSON.stringify(resData));
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, { applicationStepStatus: 'Error' });
          results.push({ locationId: location.id, dbaName: location.dbaName, status: 'error', error: resData?.message || resData?.error || `HTTP ${res.status}`, httpStatus: res.status });
          allSuccessful = false;
        }
      } catch (fetchError) {
        await base44.asServiceRole.entities.MerchantLocations.update(location.id, { applicationStepStatus: 'Error' });
        results.push({ locationId: location.id, dbaName: location.dbaName, status: 'error', error: fetchError.message });
        allSuccessful = false;
      }
    }

    if (allSuccessful) {
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, { applicationStatus: 'Submitted' });
    }

    return Response.json({ success: allSuccessful, allSubmitted: allSuccessful, corporateId, results });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});
