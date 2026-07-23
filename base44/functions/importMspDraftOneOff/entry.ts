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

function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type HsHeaders = { Authorization: string; 'Content-Type': string };

async function findOrCreateHubspotCompany(
  hsHeaders: HsHeaders,
  parentCompanyName: string,
  domainHint: string
): Promise<{ hubspotCompanyId: string; created: boolean }> {
  try {
    const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
      method: 'POST',
      headers: hsHeaders,
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: 'name', operator: 'EQ', value: parentCompanyName }],
          },
        ],
        limit: 1,
      }),
    });
    const searchData = await searchRes.json().catch(() => ({}));
    if (searchRes.ok && searchData.results?.[0]?.id) {
      return { hubspotCompanyId: String(searchData.results[0].id), created: false };
    }
  } catch (e: any) {
    console.warn('[importMspDraftOneOff] company search failed:', e?.message);
  }

  const companyRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
    method: 'POST',
    headers: hsHeaders,
    body: JSON.stringify({
      properties: {
        name: parentCompanyName,
        domain: domainHint || '',
      },
    }),
  });
  const companyData = await companyRes.json().catch(() => ({}));
  if (!companyRes.ok || !companyData.id) {
    const err: any = new Error('Failed to create HubSpot parent company');
    err.hubspotStatus = companyRes.status;
    err.hubspotError = companyData;
    throw err;
  }
  return { hubspotCompanyId: String(companyData.id), created: true };
}

async function searchContactByEmail(
  hsHeaders: HsHeaders,
  email: string
): Promise<string | null> {
  if (!email || !email.includes('@')) return null;
  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: hsHeaders,
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
          },
        ],
        limit: 1,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.results?.[0]?.id) return String(data.results[0].id);
  } catch (e: any) {
    console.warn('[importMspDraftOneOff] contact email search failed:', e?.message);
  }
  return null;
}

/** Best-effort: company-associated contacts whose firstname contains Kate. */
async function searchKateOnCompany(
  hsHeaders: HsHeaders,
  hubspotCompanyId: string,
  firstNameHint: string
): Promise<string | null> {
  const needle = String(firstNameHint || DEFAULT_CONTACT_FIRST).trim().toLowerCase();
  if (!needle) return null;
  try {
    const assocRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/companies/${hubspotCompanyId}/associations/contacts`,
      { headers: hsHeaders }
    );
    const assocData = await assocRes.json().catch(() => ({}));
    const ids: string[] = (assocData.results || [])
      .map((r: any) => String(r.toObjectId || r.id || ''))
      .filter(Boolean)
      .slice(0, 50);
    if (!ids.length) return null;

    const batchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/read', {
      method: 'POST',
      headers: hsHeaders,
      body: JSON.stringify({
        properties: ['firstname', 'lastname', 'email'],
        inputs: ids.map((id) => ({ id })),
      }),
    });
    const batchData = await batchRes.json().catch(() => ({}));
    const match = (batchData.results || []).find((c: any) => {
      const fn = String(c.properties?.firstname || '').toLowerCase();
      return fn.includes(needle);
    });
    if (match?.id) return String(match.id);
  } catch (e: any) {
    console.warn('[importMspDraftOneOff] Kate-on-company search failed:', e?.message);
  }
  return null;
}

async function findOrCreateHubspotContact(
  hsHeaders: HsHeaders,
  opts: {
    contactEmail?: string;
    signerEmail: string;
    firstName: string;
    lastName: string;
    hubspotCompanyId: string;
  }
): Promise<{ hubspotContactId: string; created: boolean }> {
  const preferEmail = String(opts.contactEmail || opts.signerEmail || '')
    .trim()
    .toLowerCase();

  let contactId = await searchContactByEmail(hsHeaders, preferEmail);
  if (contactId) return { hubspotContactId: contactId, created: false };

  if (opts.signerEmail && opts.signerEmail !== preferEmail) {
    contactId = await searchContactByEmail(hsHeaders, opts.signerEmail);
    if (contactId) return { hubspotContactId: contactId, created: false };
  }

  contactId = await searchKateOnCompany(
    hsHeaders,
    opts.hubspotCompanyId,
    opts.firstName || DEFAULT_CONTACT_FIRST
  );
  if (contactId) return { hubspotContactId: contactId, created: false };

  const emailForCreate = preferEmail || opts.signerEmail;
  if (!emailForCreate || !emailForCreate.includes('@')) {
    const err: any = new Error(
      'No HubSpot contact found and no valid email to create one — pass contactEmail'
    );
    err.status = 400;
    throw err;
  }

  const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: hsHeaders,
    body: JSON.stringify({
      properties: {
        email: emailForCreate,
        firstname: opts.firstName || DEFAULT_CONTACT_FIRST,
        lastname: opts.lastName || '',
      },
    }),
  });
  const contactData = await contactRes.json().catch(() => ({}));
  if (contactRes.ok && contactData.id) {
    return { hubspotContactId: String(contactData.id), created: true };
  }
  if (contactRes.status === 409) {
    // Duplicate email — try search again
    contactId = await searchContactByEmail(hsHeaders, emailForCreate);
    if (contactId) return { hubspotContactId: contactId, created: false };
  }
  const err: any = new Error('Failed to create HubSpot contact');
  err.hubspotStatus = contactRes.status;
  err.hubspotError = contactData;
  throw err;
}

async function createHubspotDealWithPricing(
  hsHeaders: HsHeaders,
  dealname: string
): Promise<{ dealId: string; pricingTierOnDeal: boolean }> {
  const baseProps: Record<string, string> = {
    dealname,
    dealstage: 'appointmentscheduled',
    pipeline: 'default',
    amount: '0',
    closedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    processing_pricing_tier: 'zero_cash_discount',
  };

  let dealRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
    method: 'POST',
    headers: hsHeaders,
    body: JSON.stringify({ properties: baseProps }),
  });
  let dealData = await dealRes.json().catch(() => ({}));
  let pricingTierOnDeal = true;

  if (!dealRes.ok || !dealData.id) {
    console.warn(
      '[importMspDraftOneOff] deal create with processing_pricing_tier failed; retrying without it:',
      dealRes.status,
      JSON.stringify(dealData).slice(0, 400)
    );
    const { processing_pricing_tier: _drop, ...withoutPricing } = baseProps;
    dealRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers: hsHeaders,
      body: JSON.stringify({ properties: withoutPricing }),
    });
    dealData = await dealRes.json().catch(() => ({}));
    pricingTierOnDeal = false;
  }

  if (!dealData.id) {
    const err: any = new Error('Failed to create HubSpot deal');
    err.hubspotStatus = dealRes.status;
    err.hubspotError = dealData;
    throw err;
  }
  return { dealId: String(dealData.id), pricingTierOnDeal };
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
    const parentCompanyName = String(body.parentCompanyName || DEFAULT_COMPANY_NAME).trim();

    if (!dryRun && !confirmLive) {
      return Response.json(
        {
          error: 'Live import requires dryRun: false and confirmLive: true',
        },
        { status: 400 }
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

    // MSPWare: GET only — never PUT/POST against sourceAppNo (78291).
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
    // Keep unmasked mappedRaw for DB writes; mask only for HTTP responses.
    const mappedRaw = mapMspFormToPortal(form, {
      controlPersonEmail: contactEmail,
      controlPersonFirstName: DEFAULT_CONTACT_FIRST,
    });
    mappedRaw.preview.sourceAppNo = sourceAppNo;

    const mapped = maskMappedForResponse(mappedRaw);
    const appRecord = (appData?.application || appData) as Record<string, unknown>;
    const appMeta = {
      dba: appRecord?.dba ?? appData?.dba,
      status: appRecord?.application_status ?? appRecord?.status ?? appData?.status,
      salesperson: appRecord?.salespersonid ?? appData?.salespersonid,
    };

    if (dryRun) {
      return Response.json({
        success: true,
        dryRun: true,
        sourceAppNo,
        parentCompanyName,
        appMeta,
        preview: mapped.preview,
        gaps: mapped.gaps,
        mapped,
      });
    }

    // ── Live path: HubSpot deal + Base44 entities in one confirmLive transaction ──
    const hsApiKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsApiKey) {
      return Response.json({ error: 'HUBSPOT_API_KEY is not configured' }, { status: 500 });
    }
    const hsHeaders: HsHeaders = {
      Authorization: `Bearer ${hsApiKey}`,
      'Content-Type': 'application/json',
    };

    const domainHint =
      String(mappedRaw.profile.signerEmail || contactEmail || '').split('@')[1] || '';

    let hubspotCompanyId: string;
    let hubspotContactId: string;
    let dealId: string;
    let pricingTierOnDeal = false;
    let companyCreated = false;
    let contactCreated = false;

    try {
      const company = await findOrCreateHubspotCompany(hsHeaders, parentCompanyName, domainHint);
      hubspotCompanyId = company.hubspotCompanyId;
      companyCreated = company.created;

      const contact = await findOrCreateHubspotContact(hsHeaders, {
        contactEmail,
        signerEmail: String(mappedRaw.profile.signerEmail || ''),
        firstName: String(mappedRaw.profile.firstName || DEFAULT_CONTACT_FIRST),
        lastName: String(mappedRaw.profile.lastName || ''),
        hubspotCompanyId,
      });
      hubspotContactId = contact.hubspotContactId;
      contactCreated = contact.created;

      const dba = String(mappedRaw.location.dbaName || mappedRaw.profile.legalName || parentCompanyName);
      const deal = await createHubspotDealWithPricing(hsHeaders, `${dba} — Onboarding`);
      dealId = deal.dealId;
      pricingTierOnDeal = deal.pricingTierOnDeal;

      await fetch(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/companies/${hubspotCompanyId}/deal_to_company`,
        { method: 'PUT', headers: hsHeaders }
      ).catch(() => null);
      await fetch(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts/${hubspotContactId}/deal_to_contact`,
        { method: 'PUT', headers: hsHeaders }
      ).catch(() => null);
    } catch (e: any) {
      const status = e?.status || 502;
      return Response.json(
        {
          success: false,
          error: e?.message || String(e),
          hubspotStatus: e?.hubspotStatus,
          hubspotError: e?.hubspotError,
        },
        { status }
      );
    }

    const corporateId = dealId;

    const existingProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
      { corporateId },
      '-created_date',
      1
    );
    if (existingProfiles?.length) {
      return Response.json(
        {
          error: `A merchant with corporateId "${corporateId}" already exists.`,
          corporateId,
          dealId,
          hubspotCompanyId,
          hubspotContactId,
          exists: true,
        },
        { status: 409 }
      );
    }

    // Base44 seeding — if this fails after HubSpot deal exists, return dealId for cleanup.
    try {
      let account: any = null;
      try {
        const byHs = await base44.asServiceRole.entities.MerchantAccount.filter(
          { hubspotCompanyId },
          '-created_date',
          1
        );
        account = byHs?.[0] || null;
      } catch (e: any) {
        console.warn('[importMspDraftOneOff] MerchantAccount filter failed:', e?.message);
      }
      if (!account) {
        account = await base44.asServiceRole.entities.MerchantAccount.create({
          hubspotCompanyId,
          name: parentCompanyName,
          domain: domainHint,
          legalEntities: [],
        });
      }

      const entityId = crypto.randomUUID();
      const legalEntities = [{ entityId, ...mappedRaw.legalEntity }];

      const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.create({
        corporateId,
        merchantAccountId: account.id,
        hubspotCompanyId,
        ...mappedRaw.profile,
        legalEntities,
      });

      await base44.asServiceRole.entities.MerchantAccount.update(account.id, {
        legalEntities,
      }).catch(() => null);

      const location = await base44.asServiceRole.entities.MerchantLocations.create({
        corporateId,
        entityId,
        dbaName: mappedRaw.location.dbaName,
        businessStreet: mappedRaw.location.businessStreet,
        businessCity: mappedRaw.location.businessCity,
        businessState: mappedRaw.location.businessState,
        businessZip: mappedRaw.location.businessZip,
        businessAddress: mappedRaw.location.businessAddress,
        ...(mappedRaw.location.bankDetails
          ? { bankDetails: mappedRaw.location.bankDetails }
          : {}),
        applicationStepStatus: 'In Review',
      });

      // CRITICAL: never set mspApplicationNo (leave unset so signing creates a new CD draft).
      const { mspApplicationNo: _neverSet, ...midFields } = mappedRaw.mid as any;
      const mid = await base44.asServiceRole.entities.MerchantMID.create({
        corporateId,
        locationId: location.id,
        ...midFields,
        isExistingAccount: false,
        applicationStepStatus: 'In Review',
      });

      if (mid?.mspApplicationNo) {
        console.warn(
          '[importMspDraftOneOff] clearing unexpected mspApplicationNo on MID',
          mid.id,
          mid.mspApplicationNo
        );
        await base44.asServiceRole.entities.MerchantMID.update(mid.id, {
          mspApplicationNo: null,
        });
        mid.mspApplicationNo = null;
      }

      const signerIds: string[] = [];
      for (const s of mappedRaw.signers) {
        const verifyToken = generateToken();
        const signer = await base44.asServiceRole.entities.MerchantSigners.create({
          corporateId,
          merchantAccountId: account.id,
          firstName: s.firstName,
          lastName: s.lastName,
          signerEmail: s.signerEmail,
          ownershipPercentage: s.ownershipPercentage,
          titleType: s.titleType,
          dobYear: s.dobYear,
          dobMonth: s.dobMonth,
          dobDay: s.dobDay,
          homeStreet: s.homeStreet,
          homeCity: s.homeCity,
          homeState: s.homeState,
          homeZip: s.homeZip,
          isAuthorizedSigner: s.isAuthorizedSigner,
          isPrimarySigner: s.isPrimarySigner,
          identityStatus: s.identityStatus || 'Pending Invitation',
          verifyToken,
        });
        if (signer?.id) signerIds.push(String(signer.id));
      }

      const accessToken = generateToken();
      const stage = await base44.asServiceRole.entities.StagedApplication.create({
        corporateId,
        status: 'draft',
        label: mappedRaw.location.dbaName,
        includedLocationIds: [location.id],
        includedMidIds: [mid.id],
        includedSignerIds: signerIds,
        prefilledData: {
          source: 'msp_oneoff_78291',
          sourceAppNo: sourceAppNo,
          merchantName: mappedRaw.location.dbaName,
          parentCompanyName,
          hubspotCompanyId,
          merchantAccountId: account.id,
        },
        accessToken,
        sentToEmail: mappedRaw.profile.signerEmail,
      });

      return Response.json({
        success: true,
        dryRun: false,
        sourceAppNo,
        corporateId,
        dealId,
        hubspotCompanyId,
        hubspotContactId,
        companyCreated,
        contactCreated,
        pricingTierOnDeal,
        profileId: profile.id,
        merchantAccountId: account.id,
        locationId: location.id,
        midId: mid.id,
        midHasMspApplicationNo: Boolean(mid.mspApplicationNo),
        signerIds,
        stageId: stage.id,
        preview: mapped.preview,
        gaps: mapped.gaps,
        nextSteps: [
          'Publish/redeploy importMspDraftOneOff if not already',
          'Open Applications → impersonate portal for Kate',
          'Complete gaps, then Sign — new CD draft from template 133 will be created',
          'Leave MSPWare 78291 abandoned / do not board it',
        ],
      });
    } catch (e: any) {
      console.error('[importMspDraftOneOff] Base44 seed failed after HubSpot deal:', e);
      return Response.json(
        {
          success: false,
          error:
            'HubSpot deal was created but Base44 seeding failed — clean up or retry carefully',
          detail: e?.message || String(e),
          corporateId: dealId,
          dealId,
          hubspotCompanyId,
          hubspotContactId,
        },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error('[importMspDraftOneOff]', err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
});
