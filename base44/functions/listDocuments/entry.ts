import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Cliqbux Partner Constants ───────────────────────────────────────────────
const PROFILE_CODE  = "PAPI_USA_CLIQBUX1";

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

function parsePhone(phone: string): Record<string, string> {
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

function buildBankAccounts(location: Record<string, string>) {
  const routing = location.bankDetails?.routingNumber || location.routingNumber || '';
  const account = location.bankDetails?.accountNumber || location.accountNumber || '';
  return {
    DEPOSIT: { fundingMethod: 'GROSS', accountNumber: account, sortCode: routing, country: 'USA', trueDaily: false, tapeId: '14' },
    CHARGEBACK: { accountNumber: account, sortCode: routing, country: 'USA' },
    BILLING: { accountNumber: account, sortCode: routing, country: 'USA' }
  };
}

function buildEquipmentInfo() {
  return {
    equipmentItems: [{ code: 'D500U', quantity: 1, pricingItems: [{ amount: 0, purchaseType: 'PURCHASE' }], itemSettings: { securityLevel: 'SAFE_T', connectionType: 'STANDARD_IP', services: {}, options: [] }, exceptionItems: [] }],
    terminalServices: [{ type: 'TERMINAL_AUTO_CLOSE', serviceSpecifics: '23;30;EST (UTC-05:00)' }],
    trainingType: 'TRAINING', network: 'ELAVON', fuseboxInfo: {}
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { corporateId, locationId } = await req.json();
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

    if (!profile || !location) return Response.json({ error: 'Profile or location not found' }, { status: 404 });

    const payload = {
      profileCode: PROFILE_CODE,
      principal: buildPrincipal(profile, primarySigner),
      businessInfo: buildBusinessInfo(profile, location),
      bankAccounts: buildBankAccounts(location),
      cardPricing: buildCardPricing(profile.pricingTier),
      equipmentInfo: buildEquipmentInfo()
    };

    const res = await fetch(`${elavonBase}/api/listdocuments`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) return Response.json({ error: 'Elavon listdocuments failed', elavonStatus: res.status, details: data }, { status: 500 });

    // ListDocumentsResponse: { responseId, error, userDocumentListMap: { [UserDocumentCode]: UserDocumentInfo } }
    // UserDocumentInfo has contentType (PDF|URL), signType (SIGNABLE|NOT_SIGNABLE), contextType
    return Response.json({ success: true, userDocumentListMap: data.userDocumentListMap || null, raw: data });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
