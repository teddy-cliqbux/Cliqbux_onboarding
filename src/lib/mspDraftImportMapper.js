/** Pure MSPWare form → Base44 portal payloads for one-off import. */

const OWNERSHIP_FROM_MSP = {
  SP: 'SOLE_PROPRIETOR',
  LL: 'LIMITED_COMPANY',
  CO: 'CORPORATION',
  SS: 'SUB_S_CORP',
  PA: 'GENERAL_PARTNERSHIP',
  NP: 'NON_PROFIT',
  T: 'TRUST',
};

const LLC_CLASS_FROM_MSP = {
  D: 'DISREGARDED_ENTITY',
  P: 'LLC_PARTNERSHIP',
  C: 'LLC_CORPORATION',
};

const TITLE_FROM_MSP = {
  OP: 'PROPRIETOR_OR_OWNER',
  PP: 'PARTNER_OR_PRINCIPAL',
  GM: 'GENERAL_MANAGER',
  CEO: 'CHIEF_EXECUTIVE_OFFICER',
  CFO: 'CHIEF_FINANCIAL_OFFICER',
  COO: 'CHIEF_EXECUTIVE_OFFICER',
  P: 'PRESIDENT',
  VP: 'VICE_PRESIDENT',
  MM: 'MANAGING_MEMBER',
  D: 'DIRECTOR',
  O: 'AUTHORIZED_SIGNER',
  T: 'TREASURER',
  S: 'SECRETARY',
};

function cleanDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

function parseDob(dobString) {
  const raw = String(dobString || '').trim();
  // MSPWare may send YYYY-MM-DD or compact YYYYMMDD (e.g. 19610421)
  if (/^\d{8}$/.test(raw)) {
    return { dobYear: raw.slice(0, 4), dobMonth: raw.slice(4, 6), dobDay: raw.slice(6, 8) };
  }
  const parts = raw.split('-');
  return { dobYear: parts[0] || '', dobMonth: parts[1] || '', dobDay: parts[2] || '' };
}

function mapAccountType(code) {
  if (code === 'SA') return 'savings';
  return 'checking'; // CK or unknown
}

/**
 * @param {Record<string, any>} form — MSPWare GET /form `form` object
 * @param {{ controlPersonEmail?: string, controlPersonFirstName?: string }} [opts]
 */
export function mapMspFormToPortal(form, opts = {}) {
  const f = form || {};
  const tin = cleanDigits(f.tin || f.ssn || '');
  const ownershipType = OWNERSHIP_FROM_MSP[f.ownership_type] || 'CORPORATION';
  const taxClassType =
    f.ownership_type === 'LL' ? LLC_CLASS_FROM_MSP[f.llc_class] || null : null;

  const street = String(f.business_address || '').trim();
  const city = String(f.business_city || '').trim();
  const state = String(f.business_state_usa || '').trim();
  const zip = String(f.business_zipcode || '').trim();
  const dba = String(f.full_dba_name || '').trim();
  const legalName = String(f.legal_dba_name || dba).trim();

  const routing = cleanDigits(f.deposit_account_rtg || '');
  const account = cleanDigits(f.deposit_account_no || '');
  const hasBank = Boolean(routing && account);

  const mccCode = String(f.mcc || '').trim();
  const midMccCode = mccCode === '5999' ? '' : mccCode;
  // Never invent 5999
  const gaps = [];
  if (!mccCode) gaps.push('MCC is missing — agent must set a real MCC before signing');
  if (mccCode === '5999') gaps.push('MCC 5999 is invalid — replace with a real category');
  if (!hasBank) gaps.push('Banking not on MSP form — connect bank in portal Banking step');
  if (!tin) gaps.push('TIN/EIN missing on MSP form');

  const cp = parseInt(String(f.cp_percent ?? '100'), 10) || 0;
  const internetPct = parseInt(String(f.int_percent ?? '0'), 10) || 0;
  const motoPct = parseInt(String(f.cnp_percent ?? '0'), 10) || 0; // Lesson #18 reverse

  const website = String(
    f.business_homepage_url || f.website || f.business_website || ''
  ).trim();
  if (internetPct > 0 && !website) {
    gaps.push('Online volume > 0% but no website — add businessWebsite on the MID');
  }

  const owners = Array.isArray(f.owners) ? f.owners : [];
  const cpEmail = String(opts.controlPersonEmail || '').trim().toLowerCase();
  const cpFirst = String(opts.controlPersonFirstName || 'Kate').trim().toLowerCase();

  const signers = owners.map((o, idx) => {
    const firstName = String(o.owner_firstname || '').trim();
    const lastName = String(o.owner_lastname || '').trim();
    const email = String(o.owner_email || f.business_email || '').trim().toLowerCase();
    const emailMatch = cpEmail && email === cpEmail;
    const fnLower = firstName.toLowerCase();
    // Match "Kate" to "Kathleen" etc. (prefix) or exact
    const nameMatch =
      Boolean(cpFirst) && (fnLower === cpFirst || fnLower.startsWith(cpFirst));
    const isControl =
      emailMatch || nameMatch || (owners.length === 1 && idx === 0);
    const dob = parseDob(o.owner_dob);
    if (!o.owner_dob) gaps.push(`Signer ${firstName} ${lastName}: DOB missing`);
    if (!email) gaps.push(`Signer ${firstName} ${lastName}: email missing`);

    return {
      firstName,
      lastName,
      signerEmail: email,
      // MSPWare uses ownership_percent; older dumps used owner_ownership
      ownershipPercentage:
        parseFloat(String(o.ownership_percent ?? o.owner_ownership ?? '0')) || 0,
      titleType: TITLE_FROM_MSP[o.owner_title] || 'MANAGING_MEMBER',
      ...dob,
      homeStreet: String(o.owner_address || '').trim(),
      homeCity: String(o.owner_city || '').trim(),
      homeState: String(o.owner_state_usa || '').trim(),
      homeZip: String(o.owner_zipcode || '').trim(),
      isAuthorizedSigner: Boolean(isControl),
      isPrimarySigner: Boolean(isControl),
      identityStatus: 'Pending Invitation',
    };
  });

  if (!signers.some((s) => s.isAuthorizedSigner) && signers.length) {
    signers[0].isAuthorizedSigner = true;
    signers[0].isPrimarySigner = true;
  }
  if (!signers.length) gaps.push('No owners on MSP form — add Control Person in People step');

  const primary = signers.find((s) => s.isAuthorizedSigner) || signers[0] || {};

  const bankDetails = hasBank
    ? {
        routingNumber: routing,
        accountNumber: account,
        accountType: mapAccountType(f.deposit_account_type),
        authMethod: 'manual',
        accountNumberMasked: account.length > 4 ? `****${account.slice(-4)}` : '****',
      }
    : null;

  return {
    profile: {
      legalName,
      taxId: tin || null,
      ownershipType,
      ...(taxClassType ? { taxClassType } : {}),
      establishmentYear: String(f.year_business_established || ''),
      productDescription: String(f.products_or_services || ''),
      firstName: primary.firstName || '',
      lastName: primary.lastName || '',
      signerEmail: primary.signerEmail || String(f.business_email || '').toLowerCase(),
      corporatePhone: cleanDigits(f.business_phone || ''),
      pricingTier: 'SELF_SERVE_CASH_DISCOUNT',
      applicationStatus: 'Incomplete',
      portalLockStatus: 'unlocked',
    },
    legalEntity: {
      legalBusinessName: legalName,
      federalEIN: tin || '',
      ownershipType,
      ...(taxClassType ? { taxClassType } : {}),
      establishmentYear: String(f.year_business_established || ''),
      mailingStreet: '',
      mailingCity: '',
      mailingState: '',
      mailingZip: '',
      legalAddressSameAsStore: true,
    },
    location: {
      dbaName: dba || legalName,
      businessStreet: street,
      businessCity: city,
      businessState: state,
      businessZip: zip,
      businessAddress: [street, city, state, zip].filter(Boolean).join(', '),
      bankDetails,
    },
    mid: {
      merchantName: dba || legalName,
      dbaName: dba || legalName,
      mccCode: midMccCode,
      industryType: String(f.industry_type || 'RE'),
      pricingCategory: String(f.pricing_category || '1'),
      pricingMethod: 'TIERD',
      monthlyCardSales: f.monthly_sales != null ? parseFloat(f.monthly_sales) : null,
      avgSaleAmount: f.average_sales != null ? parseFloat(f.average_sales) : null,
      highestTicketAmount: f.highest_ticket != null ? parseFloat(f.highest_ticket) : null,
      cardPresentPct: cp,
      internetPct,
      motoPct,
      businessWebsite: website || undefined,
      applicationStepStatus: 'In Review',
      isExistingAccount: false,
    },
    signers,
    gaps: [...new Set(gaps)],
    preview: {
      sourceAppNo: '78291',
      legalName,
      dba: dba || legalName,
      tinLast4: tin ? tin.slice(-4) : null,
      mcc: midMccCode || null,
      ownerNames: signers.map((s) => `${s.firstName} ${s.lastName}`.trim()),
      hasBank,
      cardSplit: { cardPresentPct: cp, internetPct, motoPct },
    },
  };
}
