import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Cliqbux Partner Constants ────────────────────────────────────────────────
const PROFILE_CODE              = "PAPI_USA_CLIQBUX1";
const REFERRER_NAME             = "PAPI_USA_CLIQBUX";
const CLIENT_ID                 = "PAHCLIQBUX";
const CLIENT_GROUP_NUMBER       = "17";
const SALES_REP_CODE            = "86764";
const PARENT_ENTITY             = "48603"; // Schedule A – Buy Rate entity under client group 17
const MONETARY_PRICING_PROGRAM  = "09828";
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

function mapTitleType(t: string): string {
  const map: Record<string, string> = {
    'OWNER':   'PROPRIETOR_OR_OWNER',
    'PARTNER': 'PARTNER_OR_PRINCIPAL',
    'MANAGER': 'GENERAL_MANAGER',
  };
  return map[t] || t || 'PROPRIETOR_OR_OWNER';
}

function mapTaxClassType(t: string): string {
  const map: Record<string, string> = {
    'LLC_CORPORATION': 'CORPORATION',
    'LLC_PARTNERSHIP': 'PARTNERSHIP',
    'SOLE_PROP':       'DISREGARDED_ENTITY',
  };
  return map[t] || t || 'CORPORATION';
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
    ids: [{ idType: 'ID_CARD', idNumber: (src.ssn || profile.ssn || '').replace(/\D/g, ''), expiryDate: {} }],
    titleType: mapTitleType(src.titleType || profile.titleType || ''),
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
    taxClassType: mapTaxClassType(profile.taxClassType || ''),
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

function buildBankAccounts(location: Record<string, string>, tapeId = '14') {
  const routing = location.bankDetails?.routingNumber || location.routingNumber || '';
  const account = location.bankDetails?.accountNumber || location.accountNumber || '';
  return {
    DEPOSIT: { fundingMethod: 'GROSS', accountNumber: account, sortCode: routing, country: 'USA', trueDaily: false, tapeId },
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
  const bankAccounts = buildBankAccounts(location, '14');
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

// vendorInfo: Cliqbux partner identity sent with every document request
const VENDOR_INFO = {
  representativeName: 'Cliqbux',
  representativeSalesCode: SALES_REP_CODE
};

// bankAccountDetailsMap: additional bank info required by MerchantAgreementDocumentInput
const BANK_ACCOUNT_DETAILS_MAP = {
  DEPOSIT:    { bankName: '', directDebitAuthorized: true },
  CHARGEBACK: { bankName: '' },
  BILLING:    { bankName: '' }
};

// Helper: try to extract HTML string from Elavon's documents map
function extractHtml(documents: Record<string, unknown>): string | null {
  for (const key of Object.keys(documents)) {
    const doc = documents[key];
    if (typeof doc === 'string' && doc.trimStart().startsWith('<')) return doc;
    if (doc && typeof doc === 'object') {
      const d = doc as Record<string, unknown>;
      const candidate = d.content ?? d.html ?? d.htmlContent ?? d.body ?? d.data;
      if (typeof candidate === 'string' && candidate.trimStart().startsWith('<')) return candidate;
    }
  }
  return null;
}

function extractDocumentUrl(documents: Record<string, unknown>): string | null {
  for (const key of Object.keys(documents)) {
    const doc = documents[key];
    if (doc && typeof doc === 'object') {
      const d = doc as Record<string, unknown>;
      const candidate = d.url ?? d.signingUrl ?? d.documentUrl ?? d.link;
      if (typeof candidate === 'string' && candidate.startsWith('http')) return candidate;
    }
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { corporateId, locationId, userDocumentListMap } = await req.json();
    if (!corporateId) return Response.json({ error: 'corporateId is required' }, { status: 400 });

    const elavonBase = (Deno.env.get('ELAVON_ENDPOINT') || 'https://uat-buynow-na.elavon.net').replace(/\/api\/.*$/, '');
    const auth = btoa(`${Deno.env.get('ELAVON_USERNAME')}:${Deno.env.get('ELAVON_PASSWORD')}`);

    const [profiles, locs, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);

    const profile = profiles[0];
    const location = locationId ? locs.find((l: Record<string, string>) => l.id === locationId) : locs[0];
    const primarySigner = signers.find((s: Record<string, boolean>) => s.isPrimarySigner) || signers[0];
    const additionalSigners = signers.filter((s: Record<string, boolean>) => !s.isPrimarySigner);

    if (!profile || !location) return Response.json({ error: 'Profile or location not found' }, { status: 404 });

    const scarecrowApp = buildScarecrowApplication(profile, location, primarySigner || {}, additionalSigners);

    // agreementId = MID placeholder (no MID pre-boarding — Postman uses "12345678")
    const agreementId = String(corporateId).replace(/\D/g, '').slice(-8).padStart(8, '0');

    // userDocumentListMap from listdocuments: keyed by doc type, value has no documentId —
    // doc IDs are profile-fixed (Cliqbux profile: 1-5). Ignore the map for IDs; use defaults.
    const baseDoc = (fallbackId: string) => ({
      documentId: fallbackId,
      agreementId,
      language: 'en'
    });

    const merchantAgreementInput = {
      ...baseDoc('3'),
      signed: false,
      groupedApplication: false,
      wetSigned: false,
      scarecrowApplication: scarecrowApp,
      vendorInfo: VENDOR_INFO,
      bankAccountDetailsMap: BANK_ACCOUNT_DETAILS_MAP,
      displayedCurrency: 'USD'
    };

    const payload = {
      profileCode: PROFILE_CODE,
      html: true,
      documentInputs: {
        TERMS_OF_SERVICE:    { ...baseDoc('1') },
        OPERATING_GUIDE:     { ...baseDoc('2') },
        MERCHANT_AGREEMENT:  merchantAgreementInput,
        APPLICATION_ADDENDUM: { ...merchantAgreementInput, documentId: '4' },
        SELF_GUARANTEE: {
          ...baseDoc('5'),
          signed: false,
          groupedApplication: false,
          wetSigned: false,
          principal: buildPrincipal(profile, primarySigner || {}),
          businessInfo: buildBusinessInfo(profile, location),
          equipmentInfo: buildEquipmentInfo()
        }
      }
    };

    const res = await fetch(`${elavonBase}/api/getdocuments`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });

    const contentType = res.headers.get('content-type') || '';
    let data: Record<string, unknown>;
    let rawText = '';

    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      rawText = await res.text();
      // Raw HTML response (non-JSON) — treat as the document content directly
      if (rawText.trimStart().startsWith('<')) {
        return Response.json({ success: true, htmlContent: rawText, documentUrl: null, raw: null });
      }
      data = { raw: rawText.slice(0, 5000) };
    }

    if (!res.ok) {
      return Response.json({ error: 'Elavon getdocuments failed', elavonStatus: res.status, details: data }, { status: 500 });
    }

    // GetDocumentsResponse: { responseId, error, documents: { [UserDocumentCode]: { ... } } }
    // Try to find HTML from documents map first (per OpenAPI schema), then top-level fields
    const documentsMap = data.documents as Record<string, unknown> | undefined;
    const htmlContent =
      (documentsMap ? extractHtml(documentsMap) : null) ||
      (typeof data.html === 'string' ? data.html : null) ||
      (typeof data.content === 'string' ? data.content : null) ||
      (rawText && rawText.trimStart().startsWith('<') ? rawText : null) ||
      null;

    const documentUrl =
      (documentsMap ? extractDocumentUrl(documentsMap) : null) ||
      (typeof data.url === 'string' ? data.url : null) ||
      (typeof data.signingUrl === 'string' ? data.signingUrl : null) ||
      null;

    return Response.json({ success: true, htmlContent, documentUrl, raw: data });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
