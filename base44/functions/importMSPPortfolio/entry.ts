import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * importMSPPortfolio — pull MSPWare merchants into Merchant Center.
 *
 * Primary source (2026-07-30): GET /merchants + GET /merchants/{mid}
 * Supplement: GET /applications (match by MID → mspApplicationNo + form TIN)
 *
 * Approach A: MerchantAccount + profile + location + MID. No HubSpot. MSP read-only.
 *
 * POST { dryRun: true }              — preview only
 * POST { confirmLive: true }         — write
 */

function mspOwnershipToInternal(code: string): string {
  const map: Record<string, string> = {
    SP: 'SOLE_PROPRIETOR',
    LL: 'LIMITED_COMPANY',
    CO: 'CORPORATION',
    SS: 'SUB_S_CORP',
    PA: 'GENERAL_PARTNERSHIP',
    NP: 'NON_PROFIT',
    T: 'TRUST',
  };
  return map[code] || 'CORPORATION';
}

function mspLlcClassToTaxClass(ownershipCode: string, llcClass: string): string | null {
  if (ownershipCode !== 'LL') return null;
  const map: Record<string, string> = {
    D: 'DISREGARDED_ENTITY',
    P: 'LLC_PARTNERSHIP',
    C: 'LLC_CORPORATION',
  };
  return map[llcClass] || 'DISREGARDED_ENTITY';
}

function mspTitleToInternal(code: string): string {
  const map: Record<string, string> = {
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
  return map[code] || 'PROPRIETOR_OR_OWNER';
}

function parseDob(dobString: string): { dobYear: string; dobMonth: string; dobDay: string } {
  const parts = (dobString || '').split('-');
  return {
    dobYear: parts[0] || '',
    dobMonth: parts[1] || '',
    dobDay: parts[2] || '',
  };
}

function cleanDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function parseEntities(raw: unknown): any[] {
  let v: any = raw ?? [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = []; }
  }
  return Array.isArray(v) ? v : [];
}

function pick(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  const lower = Object.fromEntries(Object.keys(obj).map((k) => [k.toLowerCase(), obj[k]]));
  for (const k of keys) {
    const v = lower[String(k).toLowerCase()];
    if (v != null && v !== '') return v;
  }
  return undefined;
}

function extractList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['merchants', 'applications', 'data', 'items', 'results']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function pagesOf(data: any): number {
  const p = data?.pages ?? data?.total_pages ?? data?.totalPages;
  return typeof p === 'number' && p > 0 ? p : 1;
}

function unwrapMerchant(data: any): any {
  if (!data || typeof data !== 'object') return {};
  if (data.merchant && typeof data.merchant === 'object') return data.merchant;
  return data;
}

function midOf(row: any): string {
  return String(pick(row, ['mid', 'MID', 'merchant_id', 'merchantId', 'elavon_mid']) || '').trim();
}

function statusOf(row: any): string {
  return String(
    pick(row, ['status', 'Status', 'merchant_status', 'merchantStatus', 'application_status']) || '',
  ).trim();
}

/** Import live / approved-like merchants; skip declined / closed / review. */
function isImportableStatus(status: string): boolean {
  const s = (status || '').toLowerCase();
  if (!s) return true; // unknown → include (Merchants API may omit status on list)
  if (/declin|reject|denied/.test(s)) return false;
  if (/permanent\s*close|closed|cancelled|canceled/.test(s)) return false;
  if (/in\s*review|pending|underwriting/.test(s) && !/approved|complete|active/.test(s)) return false;
  return true;
}

function normalizeCorpKey(name: string): string {
  return (name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugCorp(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'unknown';
}

function stableMspCorporateId(tin: string, corporateName: string, fallbackMid: string): string {
  if (tin && tin.length >= 4) return `msp-${tin}`;
  const slug = slugCorp(corporateName);
  if (slug && slug !== 'unknown') return `msp-corp-${slug}`;
  return `msp-mid-${String(fallbackMid || 'unknown').replace(/\W/g, '')}`;
}

function newEntityId(): string {
  return crypto.randomUUID();
}

async function batchedParallel<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<any>,
): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function paginateAll(
  mspBase: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; items: any[] }> {
  let all: any[] = [];
  let page = 1;
  let status = 0;
  while (true) {
    const url = `${mspBase}${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`;
    const res = await fetch(url, { headers });
    status = res.status;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (page === 1) {
        // bare path fallback
        const bare = await fetch(`${mspBase}${path}`, { headers });
        status = bare.status;
        const bareData = await bare.json().catch(() => ({}));
        return { ok: bare.ok, status, items: extractList(bareData) };
      }
      return { ok: false, status, items: all };
    }
    const batch = extractList(data);
    all = all.concat(batch);
    const pages = pagesOf(data);
    if (!batch.length || page >= pages) break;
    page++;
    if (page > 50) break;
  }
  return { ok: status >= 200 && status < 300, status, items: all };
}

function mapMerchantFields(raw: any) {
  const m = unwrapMerchant(raw);
  const mid = midOf(m);
  const dba = String(
    pick(m, ['dba', 'Merchant', 'merchant_name', 'merchantName', 'full_dba_name', 'name']) || '',
  ).trim();
  const corporateName = String(
    pick(m, [
      'corporate_name', 'corporateName', 'Corporate Name', 'legal_name', 'legalName',
      'legal_dba_name', 'company_name', 'companyName',
    ]) || dba,
  ).trim();
  const contact = String(pick(m, ['contact', 'Contact', 'contact_name', 'contactName']) || '').trim();
  const email = String(pick(m, ['email', 'Email', 'business_email', 'contact_email']) || '').trim();
  const phone = cleanDigits(String(pick(m, ['phone', 'Phone', 'business_phone', 'contact_phone']) || ''));
  const street = String(pick(m, ['address', 'Address', 'business_address', 'street']) || '').trim();
  const city = String(pick(m, ['city', 'City', 'business_city']) || '').trim();
  const state = String(pick(m, ['state', 'State', 'business_state', 'business_state_usa']) || '').trim();
  const zip = String(pick(m, ['zip', 'Zip', 'zipcode', 'business_zipcode']) || '').trim();
  const mcc = String(pick(m, ['sic', 'SIC Code', 'sic_code', 'mcc', 'mcc_code']) || '').trim();
  const status = statusOf(m);
  const tin = cleanDigits(String(pick(m, ['tin', 'TIN', 'ssn', 'SSN', 'ein', 'EIN', 'federal_ein', 'tax_id']) || ''));
  return {
    mid,
    dba,
    corporateName,
    contact,
    email,
    phone,
    street,
    city,
    state,
    zip,
    mcc,
    status,
    tin,
    raw: m,
  };
}

function extractTinFromForm(form: any): { tin: string; source: string | null } {
  if (!form || typeof form !== 'object') return { tin: '', source: null };
  const direct = cleanDigits(form.tin || form.ssn || '');
  if (direct) return { tin: direct, source: form.tin ? 'form.tin' : 'form.ssn' };
  const owners = Array.isArray(form.owners) ? form.owners : [];
  for (const o of owners) {
    const ssn = cleanDigits(o?.owner_ssn || o?.ssn || o?.owner_tin || '');
    if (ssn) return { tin: ssn, source: 'owners.ssn' };
  }
  return { tin: '', source: null };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const body = req.method === 'POST' ? (await req.json().catch(() => ({}))) || {} : {};

    const dryRunParam = url.searchParams.get('dryRun') === 'true' || body?.dryRun === true;
    const confirmLive = body?.confirmLive === true;
    const dryRun = !confirmLive || dryRunParam === true;
    if (!dryRun && !confirmLive) {
      return Response.json({
        error: 'Live sync requires confirmLive: true. Run with dryRun: true first.',
      }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin role required' }, { status: 403 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = { 'X-API-KEY': apiKey, 'X-App-ID': appId, Accept: 'application/json' };

    console.log(`[importMSPPortfolio] Starting${dryRun ? ' DRY RUN' : ' LIVE'} (merchants API)...`);

    // ── 1. List merchants ───────────────────────────────────────────────────
    const merchantsPage = await paginateAll(mspBase, '/merchants', mspHeaders);
    if (!merchantsPage.ok) {
      return Response.json({
        error: `GET /merchants failed HTTP ${merchantsPage.status}`,
        hint: 'Confirm MSP_APP_KEY can access Merchants API. Run probeMSPMerchantData.',
      }, { status: 502 });
    }

    const listRows = merchantsPage.items;
    const listWithMid = listRows.filter((r) => midOf(r));

    // ── 2. Detail each MID ──────────────────────────────────────────────────
    const uniqueMids = [...new Set(listWithMid.map(midOf))];
    let merchantFetchErrors = 0;
    const detailed = await batchedParallel(uniqueMids, 8, async (mid: string) => {
      try {
        const res = await fetch(`${mspBase}/merchants/${encodeURIComponent(mid)}`, { headers: mspHeaders });
        if (!res.ok) {
          merchantFetchErrors++;
          const listRow = listWithMid.find((r) => midOf(r) === mid) || {};
          return { mid, fields: mapMerchantFields({ ...listRow, mid }), detailOk: false, httpStatus: res.status };
        }
        const data = await res.json().catch(() => ({}));
        const fields = mapMerchantFields(data);
        if (!fields.mid) fields.mid = mid;
        // Fill blanks from list row
        const listRow = listWithMid.find((r) => midOf(r) === mid);
        if (listRow) {
          const fromList = mapMerchantFields(listRow);
          for (const k of ['dba', 'corporateName', 'contact', 'email', 'phone', 'street', 'city', 'state', 'zip', 'mcc', 'status', 'tin'] as const) {
            if (!fields[k] && fromList[k]) (fields as any)[k] = fromList[k];
          }
        }
        return { mid, fields, detailOk: true, httpStatus: res.status };
      } catch (err: any) {
        merchantFetchErrors++;
        console.warn(`[importMSPPortfolio] merchant ${mid}: ${err.message}`);
        const listRow = listWithMid.find((r) => midOf(r) === mid) || { mid };
        return { mid, fields: mapMerchantFields(listRow), detailOk: false, httpStatus: 0 };
      }
    });

    const importable = detailed.filter((d) => d.fields.mid && isImportableStatus(d.fields.status));
    console.log(
      `[importMSPPortfolio] merchants list=${listRows.length} withMid=${uniqueMids.length} importable=${importable.length} detailErrors=${merchantFetchErrors}`,
    );

    // ── 3. Applications supplement (MID → appNo + form TIN) ─────────────────
    const appsPage = await paginateAll(mspBase, '/applications', mspHeaders);
    const appByMid = new Map<string, any>();
    for (const a of appsPage.items || []) {
      const mid = String(a.mid || '').trim();
      if (!mid) continue;
      if (!appByMid.has(mid)) appByMid.set(mid, a);
    }

    let formFetchErrors = 0;
    let tinFromForm = 0;
    const formByMid = new Map<string, any>();
    const midsNeedingForm = importable
      .filter((d) => !d.fields.tin && appByMid.has(d.mid))
      .map((d) => d.mid);

    await batchedParallel(midsNeedingForm, 6, async (mid: string) => {
      const app = appByMid.get(mid);
      const appNo = app?.merchantapplicationno;
      if (!appNo) return null;
      try {
        const res = await fetch(`${mspBase}/applications/${appNo}/form`, { headers: mspHeaders });
        if (!res.ok) {
          formFetchErrors++;
          return null;
        }
        const data = await res.json().catch(() => ({}));
        const form = data?.form || {};
        formByMid.set(mid, form);
        const { tin } = extractTinFromForm(form);
        if (tin) tinFromForm++;
      } catch {
        formFetchErrors++;
      }
      return null;
    });

    // Merge TIN + ownership from form into merchant fields
    for (const item of importable) {
      const form = formByMid.get(item.mid);
      if (!form) continue;
      const { tin, source } = extractTinFromForm(form);
      if (tin && !item.fields.tin) {
        item.fields.tin = tin;
        item.tinSource = source;
      }
      item.form = form;
      if (!item.fields.corporateName && form.legal_dba_name) {
        item.fields.corporateName = String(form.legal_dba_name).trim();
      }
      if (!item.fields.dba && form.full_dba_name) {
        item.fields.dba = String(form.full_dba_name).trim();
      }
      if (!item.fields.street && form.business_address) {
        item.fields.street = form.business_address;
        item.fields.city = form.business_city || item.fields.city;
        item.fields.state = form.business_state_usa || item.fields.state;
        item.fields.zip = form.business_zipcode || item.fields.zip;
      }
      if (!item.fields.email) {
        item.fields.email = form.business_email || form.chargebacks_retrievals_email || '';
      }
      if (!item.fields.phone) {
        item.fields.phone = cleanDigits(form.business_phone || '');
      }
      if (!item.fields.mcc && form.mcc) item.fields.mcc = String(form.mcc);
    }

    // Merchant-detail TIN source
    for (const item of importable) {
      if (item.fields.tin && !item.tinSource) item.tinSource = 'merchant';
    }

    // ── 4. Group by TIN or corporate name ───────────────────────────────────
    const groups = new Map<string, typeof importable>();
    for (const item of importable) {
      const tin = item.fields.tin || '';
      const corp = normalizeCorpKey(item.fields.corporateName || item.fields.dba);
      const groupKey = tin || corp;
      if (!groupKey) continue;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(item);
    }

    // ── 5. Existing Base44 state ────────────────────────────────────────────
    const [allProfiles, allMerchantMIDs, allAccounts] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({}),
      base44.asServiceRole.entities.MerchantMID.filter({}),
      base44.asServiceRole.entities.MerchantAccount.filter({}).catch(() => []),
    ]);

    const profileByTin = new Map<string, any>();
    const profileByName = new Map<string, any>();
    const profileByCorporateId = new Map<string, any>();
    for (const p of allProfiles || []) {
      if (p.taxId) profileByTin.set(cleanDigits(p.taxId), p);
      if (p.legalName) profileByName.set(normalizeCorpKey(p.legalName), p);
      if (p.corporateId) profileByCorporateId.set(String(p.corporateId), p);
    }

    const accountByEin = new Map<string, any>();
    const accountByName = new Map<string, any>();
    const accountById = new Map<string, any>();
    for (const a of allAccounts || []) {
      accountById.set(String(a.id), a);
      if (a.name) accountByName.set(normalizeCorpKey(a.name), a);
      for (const le of parseEntities(a.legalEntities)) {
        const ein = cleanDigits(le.federalEIN || '');
        if (ein) accountByEin.set(ein, a);
      }
    }

    const trackedAppNos = new Set(
      (allMerchantMIDs || []).map((c: any) => String(c.mspApplicationNo)).filter(Boolean),
    );
    const trackedMids = new Set(
      (allMerchantMIDs || []).map((c: any) => String(c.elavonMID || '').trim()).filter(Boolean),
    );

    const summary = {
      source: 'merchants',
      merchantsScanned: listRows.length,
      merchantsWithMid: uniqueMids.length,
      importableMerchants: importable.length,
      merchantFetchErrors,
      formFetchErrors,
      tinFromMerchant: importable.filter((i) => i.tinSource === 'merchant').length,
      tinFromForm,
      tinUnavailable: importable.filter((i) => !i.fields.tin).length,
      applicationsScanned: appsPage.items?.length || 0,
      applicationsMatchedByMid: importable.filter((i) => appByMid.has(i.mid)).length,
      // legacy keys for UI
      mspAppsScanned: appsPage.items?.length || 0,
      approvedWithMid: importable.length,
      groups: groups.size,
      accounts: { created: 0, linked: 0 },
      corporateEntities: { found: 0, created: 0, skipped: 0, linkedToAccount: 0 },
      locations: { created: 0, skipped: 0 },
      merchantMIDs: { created: 0, skipped: 0, errors: 0 },
    };
    const entityResults: any[] = [];

    // ── 6. Process groups ───────────────────────────────────────────────────
    for (const [groupKey, items] of groups) {
      const rep = items[0];
      const f = rep.fields;
      const form = rep.form || {};
      const tin = f.tin || '';
      const legalName = (f.corporateName || f.dba || '').trim();
      const ownershipCode = form.ownership_type || 'CO';
      const primaryOwner = (form.owners || [])[0] || {};
      const dob = parseDob(primaryOwner.owner_dob || '');
      const email = f.email || primaryOwner.owner_email || form.business_email || '';
      const phone = f.phone || cleanDigits(form.business_phone || '');
      const taxClassType = mspLlcClassToTaxClass(ownershipCode, form.llc_class || '');
      const nameKey = normalizeCorpKey(legalName);
      const corporateIdStable = stableMspCorporateId(tin, legalName, rep.mid);

      let account =
        (tin && accountByEin.get(tin))
        || accountByName.get(nameKey)
        || null;
      let accountCreated = false;

      if (account) {
        summary.accounts.linked++;
      } else {
        const entityId = newEntityId();
        const legalEntities = tin
          ? [{
              entityId,
              legalBusinessName: legalName,
              federalEIN: tin,
              ownershipType: mspOwnershipToInternal(ownershipCode),
              ...(taxClassType ? { taxClassType } : {}),
              establishmentYear: form.year_business_established || '',
              mailingStreet: f.street || form.legal_address || form.business_address || '',
              mailingCity: f.city || form.legal_city || form.business_city || '',
              mailingState: f.state || form.legal_state_usa || form.business_state_usa || '',
              mailingZip: f.zip || form.legal_zipcode || form.business_zipcode || '',
            }]
          : [];

        const accountPayload = {
          name: legalName || `MSP ${groupKey.slice(0, 24)}`,
          domain: null,
          hubspotCompanyId: null,
          legalEntities,
        };

        if (!dryRun) {
          account = await base44.asServiceRole.entities.MerchantAccount.create(accountPayload);
          accountById.set(String(account.id), account);
          if (tin) accountByEin.set(tin, account);
          accountByName.set(nameKey, account);
        } else {
          account = { id: `[dry-run-account:${legalName}]`, ...accountPayload };
        }
        accountCreated = true;
        summary.accounts.created++;
      }

      const merchantAccountId = account.id;

      let profile =
        (tin && profileByTin.get(tin))
        || profileByName.get(nameKey)
        || profileByCorporateId.get(corporateIdStable)
        || null;
      let profileCreated = false;

      if (profile) {
        summary.corporateEntities.skipped++;
        if (!profile.merchantAccountId && !dryRun) {
          profile = await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, {
            merchantAccountId,
          });
          summary.corporateEntities.linkedToAccount++;
        } else if (!profile.merchantAccountId && dryRun) {
          summary.corporateEntities.linkedToAccount++;
        } else if (profile.merchantAccountId) {
          summary.corporateEntities.linkedToAccount++;
        }
      } else {
        summary.corporateEntities.found++;
        const contactParts = (f.contact || '').trim().split(/\s+/);
        const profilePayload: Record<string, unknown> = {
          corporateId: corporateIdStable,
          merchantAccountId,
          legalName,
          dbaName: f.dba || legalName,
          signerEmail: email || `import+msp-${(tin || slugCorp(legalName)).slice(0, 12)}@cliqbux.com`,
          taxId: tin || null,
          ownershipType: mspOwnershipToInternal(ownershipCode),
          ...(taxClassType ? { taxClassType } : {}),
          firstName: primaryOwner.owner_firstname || contactParts[0] || '',
          lastName: primaryOwner.owner_lastname || contactParts.slice(1).join(' ') || '',
          corporatePhone: phone,
          titleType: mspTitleToInternal(primaryOwner.owner_title || ''),
          ...dob,
          homeStreet: primaryOwner.owner_address || '',
          homeCity: primaryOwner.owner_city || '',
          homeState: primaryOwner.owner_state_usa || '',
          homeZip: primaryOwner.owner_zipcode || '',
          productDescription: form.products_or_services || '',
          establishmentYear: form.year_business_established || '',
          monthlyCardSales: form.monthly_sales || '',
          avgSaleAmount: form.average_sales || '',
          highestTicketAmount: form.highest_ticket || '',
          cardPresentPct: form.cp_percent || '100',
          mccCode: f.mcc || form.mcc || '',
          applicationStatus: 'Submitted',
          handoffStage: 'support',
          portalLockStatus: 'unlocked',
        };

        if (!dryRun) {
          profile = await base44.asServiceRole.entities.MerchantCorporateProfile.create(profilePayload);
          if (tin) profileByTin.set(tin, profile);
          profileByName.set(nameKey, profile);
          profileByCorporateId.set(corporateIdStable, profile);
        } else {
          profile = { id: `[dry-run:${legalName}]`, ...profilePayload };
        }
        profileCreated = true;
        summary.corporateEntities.created++;
        summary.corporateEntities.linkedToAccount++;
      }

      const corporateId = String(profile.corporateId || corporateIdStable);

      const existingLocations: any[] = dryRun
        ? []
        : await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });

      const midResults: any[] = [];

      for (const { mid, fields, form: itemForm } of items) {
        if (trackedMids.has(mid)) {
          summary.merchantMIDs.skipped++;
          midResults.push({ mid, dba: fields.dba, result: 'mid_already_tracked' });
          continue;
        }

        const app = appByMid.get(mid);
        const appNo = app?.merchantapplicationno ? String(app.merchantapplicationno) : '';
        if (appNo && trackedAppNos.has(appNo)) {
          summary.merchantMIDs.skipped++;
          midResults.push({ mid, appNo, dba: fields.dba, result: 'mid_already_tracked' });
          continue;
        }

        const ff = itemForm || {};
        const street = (fields.street || ff.business_address || '').trim().toLowerCase();
        const zip = cleanDigits(fields.zip || ff.business_zipcode || '');

        let location = existingLocations.find((l: any) => {
          const ls = (l.businessStreet || l.businessAddress || '').trim().toLowerCase();
          const lz = cleanDigits(l.businessZip || '');
          return ls && ls === street && lz === zip;
        });

        if (!location) {
          const locationPayload = {
            corporateId,
            dbaName: fields.dba || fields.corporateName,
            businessStreet: fields.street || ff.business_address || '',
            businessCity: fields.city || ff.business_city || '',
            businessState: fields.state || ff.business_state_usa || '',
            businessZip: fields.zip || ff.business_zipcode || '',
            businessAddress: [
              fields.street || ff.business_address,
              fields.city || ff.business_city,
              fields.state || ff.business_state_usa,
              fields.zip || ff.business_zipcode,
            ].filter(Boolean).join(', '),
            applicationStepStatus: 'Active',
          };
          if (!dryRun) {
            location = await base44.asServiceRole.entities.MerchantLocations.create(locationPayload);
            existingLocations.push(location);
          } else {
            location = { id: `[dry-run-loc:${mid}]`, ...locationPayload };
          }
          summary.locations.created++;
        } else {
          summary.locations.skipped++;
        }

        const merchantMIDPayload = {
          locationId: location.id,
          corporateId,
          merchantName: fields.dba || fields.corporateName,
          dbaName: fields.dba || fields.corporateName,
          mccCode: fields.mcc || ff.mcc || '',
          industryType: ff.industry_type || 'RE',
          pricingCategory: ff.pricing_category || '1',
          pricingMethod: ff.pricing_method || 'ICPLS',
          monthlyCardSales: ff.monthly_sales ? parseFloat(ff.monthly_sales) : null,
          avgSaleAmount: ff.average_sales ? parseFloat(ff.average_sales) : null,
          highestTicketAmount: ff.highest_ticket ? parseFloat(ff.highest_ticket) : null,
          cardPresentPct: ff.cp_percent ? parseFloat(ff.cp_percent) : 100,
          ...(appNo ? { mspApplicationNo: appNo } : {}),
          elavonMID: mid,
          isExistingAccount: true,
          existingAccountSource: 'mspware_import',
          applicationStepStatus: 'Active (Existing)',
        };

        try {
          if (!dryRun) {
            await base44.asServiceRole.entities.MerchantMID.create(merchantMIDPayload);
            trackedMids.add(mid);
            if (appNo) trackedAppNos.add(appNo);
          }
          summary.merchantMIDs.created++;
          midResults.push({
            mid,
            appNo: appNo || null,
            dba: fields.dba,
            result: dryRun ? 'would_create' : 'created',
          });
        } catch (err: any) {
          summary.merchantMIDs.errors++;
          midResults.push({ mid, dba: fields.dba, result: 'error', error: err.message });
        }
      }

      const tinSources = [...new Set(items.map((i: any) => i.tinSource).filter(Boolean))];
      entityResults.push({
        groupKey,
        legalName,
        tin: tin ? `***${tin.slice(-4)}` : null,
        tinSource: tinSources[0] || null,
        tinUnavailable: !tin,
        corporateId,
        merchantAccountId: dryRun && accountCreated ? account.id : merchantAccountId,
        accountCreated,
        profileCreated,
        mspRef: corporateId.startsWith('msp-'),
        midCount: items.length,
        apps: midResults,
      });
    }

    return Response.json({
      success: true,
      dryRun,
      confirmLive: !dryRun,
      hubspot: false,
      source: 'merchants',
      summary,
      entities: entityResults,
    });
  } catch (error: any) {
    console.error('[importMSPPortfolio]', error);
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
