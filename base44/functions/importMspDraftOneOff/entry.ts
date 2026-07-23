import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// POST /functions/importMspDraftOneOff
// Body (safe): { "dryRun": true }
// Body (live): { "dryRun": false, "confirmLive": true, "contactEmail": "kate@..." }
// Admin session required. Never mutates MSPWare app 78291.

const DEFAULT_SOURCE_APP_NO = '78291';
const DEFAULT_COMPANY_NAME = 'KK House of Lechon LLC';
const DEFAULT_CONTACT_FIRST = 'Kate';

// --- BEGIN mspDraftImportMapper (sync with src/lib/mspDraftImportMapper.js) ---
/** Pure MSPWare form → Base44 portal payloads for one-off import. */

const OWNERSHIP_FROM_MSP: Record<string, string> = {
  SP: 'SOLE_PROPRIETOR',
  LL: 'LIMITED_COMPANY',
  CO: 'CORPORATION',
  SS: 'SUB_S_CORP',
  PA: 'GENERAL_PARTNERSHIP',
  NP: 'NON_PROFIT',
  T: 'TRUST',
};

const LLC_CLASS_FROM_MSP: Record<string, string> = {
  D: 'DISREGARDED_ENTITY',
  P: 'LLC_PARTNERSHIP',
  C: 'LLC_CORPORATION',
};

const TITLE_FROM_MSP: Record<string, string> = {
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

function cleanDigits(s: unknown): string {
  return String(s || '').replace(/\D/g, '');
}

function parseDob(dobString: unknown): { dobYear: string; dobMonth: string; dobDay: string } {
  const parts = String(dobString || '').split('-');
  return { dobYear: parts[0] || '', dobMonth: parts[1] || '', dobDay: parts[2] || '' };
}

function mapAccountType(code: unknown): string {
  if (code === 'SA') return 'savings';
  return 'checking'; // CK or unknown
}

function mapMspFormToPortal(
  form: Record<string, unknown>,
  opts: { controlPersonEmail?: string; controlPersonFirstName?: string } = {}
) {
  const f = form || {};
  const tin = cleanDigits(f.tin || f.ssn || '');
  const ownershipType = OWNERSHIP_FROM_MSP[String(f.ownership_type)] || 'CORPORATION';
  const taxClassType =
    f.ownership_type === 'LL' ? LLC_CLASS_FROM_MSP[String(f.llc_class)] || null : null;

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
  const gaps: string[] = [];
  if (!mccCode) gaps.push('MCC is missing — agent must set a real MCC before signing');
  if (mccCode === '5999') gaps.push('MCC 5999 is invalid — replace with a real category');
  if (!hasBank) gaps.push('Banking not on MSP form — connect bank in portal Banking step');
  if (!tin) gaps.push('TIN/EIN missing on MSP form');

  const cp = parseInt(String(f.cp_percent ?? '100'), 10) || 0;
  const internetPct = parseInt(String(f.int_percent ?? '0'), 10) || 0;
  const motoPct = parseInt(String(f.cnp_percent ?? '0'), 10) || 0;

  const website = String(
    f.business_homepage_url || f.website || f.business_website || ''
  ).trim();
  if (internetPct > 0 && !website) {
    gaps.push('Online volume > 0% but no website — add businessWebsite on the MID');
  }

  const owners = Array.isArray(f.owners) ? f.owners : [];
  const cpEmail = String(opts.controlPersonEmail || '').trim().toLowerCase();
  const cpFirst = String(opts.controlPersonFirstName || 'Kate').trim().toLowerCase();

  const signers = owners.map((o: Record<string, unknown>, idx: number) => {
    const firstName = String(o.owner_firstname || '').trim();
    const lastName = String(o.owner_lastname || '').trim();
    const email = String(o.owner_email || f.business_email || '').trim().toLowerCase();
    const emailMatch = cpEmail && email === cpEmail;
    const nameMatch = firstName.toLowerCase() === cpFirst;
    const isControl =
      emailMatch || nameMatch || (owners.length === 1 && idx === 0);
    const dob = parseDob(o.owner_dob);
    if (!o.owner_dob) gaps.push(`Signer ${firstName} ${lastName}: DOB missing`);
    if (!email) gaps.push(`Signer ${firstName} ${lastName}: email missing`);

    return {
      firstName,
      lastName,
      signerEmail: email,
      ownershipPercentage: parseFloat(String(o.owner_ownership || '0')) || 0,
      titleType: TITLE_FROM_MSP[String(o.owner_title)] || 'MANAGING_MEMBER',
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
      monthlyCardSales: f.monthly_sales != null ? parseFloat(String(f.monthly_sales)) : null,
      avgSaleAmount: f.average_sales != null ? parseFloat(String(f.average_sales)) : null,
      highestTicketAmount: f.highest_ticket != null ? parseFloat(String(f.highest_ticket)) : null,
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
// --- END mspDraftImportMapper ---

function maskMappedForResponse(mapped: ReturnType<typeof mapMspFormToPortal>) {
  const out = JSON.parse(JSON.stringify(mapped)) as ReturnType<typeof mapMspFormToPortal>;
  const acct = out.location?.bankDetails?.accountNumber;
  if (acct) {
    const digits = String(acct);
    out.location.bankDetails!.accountNumber =
      digits.length > 4 ? `****${digits.slice(-4)}` : '****';
  }
  return out;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin-only: requires a Base44 workspace session. Merchant portal tokens
    // are deliberately NOT accepted here.
    let adminUser: unknown = null;
    try {
      adminUser = await base44.auth.me();
    } catch {
      /* no session */
    }
    if (!adminUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const confirmLive = body.confirmLive === true;
    const sourceAppNo = String(body.sourceAppNo || DEFAULT_SOURCE_APP_NO).trim();
    const contactEmail = body.contactEmail ? String(body.contactEmail).trim() : undefined;
    const _parentCompanyName = String(body.parentCompanyName || DEFAULT_COMPANY_NAME).trim();

    if (!dryRun && !confirmLive) {
      return Response.json(
        {
          error: 'Live import requires dryRun: false and confirmLive: true',
        },
        { status: 400 }
      );
    }

    if (!dryRun && confirmLive) {
      return Response.json(
        { success: false, error: 'Live path not implemented yet' },
        { status: 501 }
      );
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(
      /\/$/,
      ''
    );
    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    if (!apiKey) {
      return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });
    }

    const headers = {
      'X-API-KEY': apiKey,
      'X-App-ID': appId,
      Accept: 'application/json',
    };

    const appRes = await fetch(`${mspBase}/applications/${sourceAppNo}`, { headers });
    const appText = await appRes.text();
    let appData: Record<string, unknown> = {};
    try {
      appData = JSON.parse(appText);
    } catch {
      return Response.json(
        {
          error: 'Failed to parse MSP application response',
          status: appRes.status,
          snippet: appText.slice(0, 500),
        },
        { status: appRes.ok ? 500 : appRes.status }
      );
    }

    if (!appRes.ok) {
      return Response.json(
        { error: 'MSP application GET failed', status: appRes.status, appData },
        { status: appRes.status }
      );
    }

    const formRes = await fetch(`${mspBase}/applications/${sourceAppNo}/form`, { headers });
    const formText = await formRes.text();
    let formData: Record<string, unknown> = {};
    try {
      formData = JSON.parse(formText);
    } catch {
      return Response.json(
        {
          error: 'Failed to parse MSP form response',
          status: formRes.status,
          snippet: formText.slice(0, 500),
        },
        { status: formRes.ok ? 500 : formRes.status }
      );
    }

    if (!formRes.ok) {
      return Response.json(
        { error: 'MSP form GET failed', status: formRes.status, formData },
        { status: formRes.status }
      );
    }

    const form = (formData?.form || formData) as Record<string, unknown>;
    const mappedRaw = mapMspFormToPortal(form, {
      controlPersonEmail: contactEmail,
      controlPersonFirstName: DEFAULT_CONTACT_FIRST,
    });
    mappedRaw.preview.sourceAppNo = sourceAppNo;

    const mapped = maskMappedForResponse(mappedRaw);

    const appRecord = (appData?.application || appData) as Record<string, unknown>;

    return Response.json({
      success: true,
      dryRun: true,
      sourceAppNo,
      parentCompanyName: _parentCompanyName,
      appMeta: {
        dba: appRecord?.dba ?? appData?.dba,
        status: appRecord?.application_status ?? appRecord?.status ?? appData?.status,
        salesperson: appRecord?.salespersonid ?? appData?.salespersonid,
      },
      preview: mapped.preview,
      gaps: mapped.gaps,
      mapped,
    });
  } catch (err) {
    console.error('[importMspDraftOneOff]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
});
