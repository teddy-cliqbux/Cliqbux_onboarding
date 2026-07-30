import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * importMSPPortfolio — MSP Merchants → Merchant Center (Parent → Legal Entity → MID).
 *
 * Primary: GET /merchants + GET /merchants/{mid}
 * Parent (MerchantAccount): contact email → contact name → corporate_name
 * Legal entity + profile: federal_tax_id → corporate_name
 * Location/MID: each mid / DBA name
 * Enrichment (optional): GET /applications by mid, form owners, signatures signers
 *
 * POST { dryRun: true } | { confirmLive: true }
 * No HubSpot. MSP read-only. Never invents TIN.
 */

function mspOwnershipToInternal(code: string): string {
  const map: Record<string, string> = {
    SP: 'SOLE_PROPRIETOR', LL: 'LIMITED_COMPANY', CO: 'CORPORATION', SS: 'SUB_S_CORP',
    PA: 'GENERAL_PARTNERSHIP', NP: 'NON_PROFIT', T: 'TRUST',
  };
  return map[code] || 'CORPORATION';
}

function mspLlcClassToTaxClass(ownershipCode: string, llcClass: string): string | null {
  if (ownershipCode !== 'LL') return null;
  const map: Record<string, string> = { D: 'DISREGARDED_ENTITY', P: 'LLC_PARTNERSHIP', C: 'LLC_CORPORATION' };
  return map[llcClass] || 'DISREGARDED_ENTITY';
}

function mspTitleToInternal(code: string): string {
  const map: Record<string, string> = {
    OP: 'PROPRIETOR_OR_OWNER', PP: 'PARTNER_OR_PRINCIPAL', GM: 'GENERAL_MANAGER',
    CEO: 'CHIEF_EXECUTIVE_OFFICER', CFO: 'CHIEF_FINANCIAL_OFFICER', COO: 'CHIEF_EXECUTIVE_OFFICER',
    P: 'PRESIDENT', VP: 'VICE_PRESIDENT', MM: 'MANAGING_MEMBER', D: 'DIRECTOR',
    O: 'AUTHORIZED_SIGNER', T: 'TREASURER', S: 'SECRETARY',
  };
  return map[code] || 'PROPRIETOR_OR_OWNER';
}

function parseDob(dobString: string) {
  const parts = (dobString || '').split('-');
  return { dobYear: parts[0] || '', dobMonth: parts[1] || '', dobDay: parts[2] || '' };
}

function cleanDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
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
  // OpenAPI returns merchant fields at top level alongside success/error
  return data;
}

function midOf(row: any): string {
  return String(pick(row, ['mid', 'MID', 'merchant_id', 'merchantId', 'elavon_mid']) || '').trim();
}

function statusOf(row: any): string {
  return String(pick(row, ['status', 'Status', 'merchant_status', 'merchantStatus', 'application_status']) || '').trim();
}

function isImportableStatus(status: string): boolean {
  const s = (status || '').toLowerCase();
  if (!s) return true;
  if (/declin|reject|denied/.test(s)) return false;
  if (/permanent\s*close|closed|cancelled|canceled/.test(s)) return false;
  if (/in\s*review|pending|underwriting/.test(s) && !/approved|complete|active/.test(s)) return false;
  return true;
}

function normalizeNameKey(name: string): string {
  return (name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugCorp(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'unknown';
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

function firstAddress(m: any): { street: string; city: string; state: string; zip: string } {
  const addrs = Array.isArray(m.addresses) ? m.addresses : [];
  const a = addrs.find((x: any) => x && (x.address_line_1 || x.city)) || addrs[0] || {};
  return {
    street: String(a.address_line_1 || pick(m, ['address', 'Address', 'business_address', 'street']) || '').trim(),
    city: String(a.city || pick(m, ['city', 'City', 'business_city']) || '').trim(),
    state: String(a.state || pick(m, ['state', 'State', 'business_state', 'business_state_usa']) || '').trim(),
    zip: String(a.postal_code || pick(m, ['zip', 'Zip', 'zipcode', 'business_zipcode']) || '').trim(),
  };
}

function mapMerchantFields(raw: any) {
  const m = unwrapMerchant(raw);
  const mid = midOf(m);
  // DBA / storefront = MSP `name` (list "Merchant")
  const dba = String(pick(m, ['name', 'dba', 'Merchant', 'merchant_name', 'merchantName', 'full_dba_name']) || '').trim();
  // Legal entity = corporate_name (do not fall back to DBA until necessary)
  const corporateNameRaw = String(pick(m, [
    'corporate_name', 'corporateName', 'Corporate Name', 'legal_name', 'legalName',
    'legal_dba_name', 'company_name', 'companyName',
  ]) || '').trim();
  const corporateName = corporateNameRaw || dba;
  const first = String(pick(m, ['contact_firstname', 'contactFirstname']) || '').trim();
  const last = String(pick(m, ['contact_lastname', 'contactLastname']) || '').trim();
  const contactFromParts = [first, last].filter(Boolean).join(' ');
  const contact = String(
    pick(m, ['contact_name', 'contactName', 'contact', 'Contact']) || contactFromParts || '',
  ).trim();
  const email = normalizeEmail(String(pick(m, ['email', 'Email', 'business_email', 'contact_email']) || ''));
  const phone = cleanDigits(String(pick(m, ['phone', 'Phone', 'business_phone', 'contact_phone']) || ''));
  const addr = firstAddress(m);
  const mcc = String(pick(m, ['mcc', 'mcc_code', 'sic', 'SIC Code', 'sic_code']) || '').trim();
  const status = statusOf(m);
  // OpenAPI: federal_tax_id
  const tin = cleanDigits(String(pick(m, [
    'federal_tax_id', 'federalTaxId', 'tin', 'TIN', 'ssn', 'SSN', 'ein', 'EIN', 'federal_ein', 'tax_id',
  ]) || ''));
  const elavonAppId = String(pick(m, ['elavonappid', 'elavon_app_id', 'elavonAppId']) || '').trim();
  return {
    mid, dba, corporateName, contact, contactFirst: first, contactLast: last,
    email, phone, ...addr, mcc, status, tin, elavonAppId, raw: m,
  };
}

function extractTinFromForm(form: any): { tin: string; source: string | null } {
  if (!form || typeof form !== 'object') return { tin: '', source: null };
  const direct = cleanDigits(form.tin || form.ssn || '');
  if (direct) return { tin: direct, source: form.tin ? 'form.tin' : 'form.ssn' };
  for (const o of Array.isArray(form.owners) ? form.owners : []) {
    const ssn = cleanDigits(o?.owner_ssn || o?.ssn || o?.owner_tin || '');
    if (ssn) return { tin: ssn, source: 'owners.ssn' };
  }
  return { tin: '', source: null };
}

function ownerKeyOf(fields: { email?: string; contact?: string; corporateName?: string; dba?: string }): string {
  if (fields.email) return `email:${fields.email}`;
  const contact = normalizeNameKey(fields.contact || '');
  if (contact) return `contact:${contact}`;
  const corp = normalizeNameKey(fields.corporateName || fields.dba || '');
  if (corp) return `corp:${corp}`;
  return '';
}

function legalKeyOf(fields: { tin?: string; corporateName?: string; dba?: string }): string {
  if (fields.tin && fields.tin.length >= 4) return `tin:${fields.tin}`;
  const corp = normalizeNameKey(fields.corporateName || fields.dba || '');
  return corp ? `corp:${corp}` : '';
}

function accountDisplayName(fields: { contact?: string; email?: string; corporateName?: string }): string {
  if (fields.contact) return fields.contact;
  if (fields.email) return fields.email.split('@')[0] || fields.email;
  return fields.corporateName || 'MSP Portfolio';
}

async function batchedParallel<T>(items: T[], concurrency: number, fn: (item: T) => Promise<any>): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

async function paginateAll(mspBase: string, path: string, headers: Record<string, string>) {
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
    console.log(`[importMSPPortfolio] Starting${dryRun ? ' DRY RUN' : ' LIVE'} (owner hierarchy)...`);

    // ── 1. Merchants list + detail ──────────────────────────────────────────
    const merchantsPage = await paginateAll(mspBase, '/merchants', mspHeaders);
    if (!merchantsPage.ok) {
      return Response.json({
        error: `GET /merchants failed HTTP ${merchantsPage.status}`,
        hint: 'Run probeMSPMerchantData.',
      }, { status: 502 });
    }

    const listWithMid = merchantsPage.items.filter((r) => midOf(r));
    const uniqueMids = [...new Set(listWithMid.map(midOf))];
    let merchantFetchErrors = 0;

    const detailed = await batchedParallel(uniqueMids, 8, async (mid: string) => {
      try {
        const res = await fetch(`${mspBase}/merchants/${encodeURIComponent(mid)}`, { headers: mspHeaders });
        const listRow = listWithMid.find((r) => midOf(r) === mid) || { mid };
        if (!res.ok) {
          merchantFetchErrors++;
          return { mid, fields: mapMerchantFields(listRow), detailOk: false };
        }
        const data = await res.json().catch(() => ({}));
        const fields = mapMerchantFields(data);
        if (!fields.mid) fields.mid = mid;
        const fromList = mapMerchantFields(listRow);
        for (const k of ['dba', 'corporateName', 'contact', 'email', 'phone', 'street', 'city', 'state', 'zip', 'mcc', 'status', 'tin'] as const) {
          if (!(fields as any)[k] && (fromList as any)[k]) (fields as any)[k] = (fromList as any)[k];
        }
        return { mid, fields, detailOk: true, tinSource: fields.tin ? 'merchant.federal_tax_id' : null };
      } catch (err: any) {
        merchantFetchErrors++;
        console.warn(`[importMSPPortfolio] merchant ${mid}: ${err.message}`);
        return { mid, fields: mapMerchantFields(listWithMid.find((r) => midOf(r) === mid) || { mid }), detailOk: false };
      }
    });

    const importable = detailed.filter((d) => d.fields.mid && isImportableStatus(d.fields.status));

    // ── 2. Applications bridge + form / signatures enrichment ───────────────
    const appsPage = await paginateAll(mspBase, '/applications', mspHeaders);
    const appByMid = new Map<string, any>();
    const appByNo = new Map<string, any>();
    for (const a of appsPage.items || []) {
      const mid = String(a.mid || '').trim();
      const appNo = String(a.merchantapplicationno || '').trim();
      if (mid && !appByMid.has(mid)) appByMid.set(mid, a);
      if (appNo) appByNo.set(appNo, a);
    }

    let formFetchErrors = 0;
    let signaturesOk = 0;
    let signaturesMiss = 0;
    let tinFromForm = 0;
    let emailFromSigner = 0;
    let emailFromOwner = 0;

    const enrichTargets = importable.filter((d) => {
      if (appByMid.has(d.mid)) return true;
      // elavonappid sometimes equals app no — try numeric match
      const eid = d.fields.elavonAppId;
      return eid && (/^\d+$/.test(eid) || appByNo.has(eid));
    });

    await batchedParallel(enrichTargets, 5, async (item: any) => {
      let app = appByMid.get(item.mid);
      if (!app && item.fields.elavonAppId && appByNo.has(item.fields.elavonAppId)) {
        app = appByNo.get(item.fields.elavonAppId);
      }
      const appNo = app?.merchantapplicationno ? String(app.merchantapplicationno) : (
        /^\d+$/.test(item.fields.elavonAppId || '') ? item.fields.elavonAppId : ''
      );
      if (!appNo) return null;
      item.appNo = appNo;

      try {
        const formRes = await fetch(`${mspBase}/applications/${appNo}/form`, { headers: mspHeaders });
        if (formRes.ok) {
          const formData = await formRes.json().catch(() => ({}));
          const form = formData?.form || {};
          item.form = form;
          const { tin, source } = extractTinFromForm(form);
          if (tin && !item.fields.tin) {
            item.fields.tin = tin;
            item.tinSource = source;
            tinFromForm++;
          }
          if (!item.fields.corporateName && form.legal_dba_name) {
            item.fields.corporateName = String(form.legal_dba_name).trim();
          }
          const owner0 = (form.owners || [])[0] || {};
          if (!item.fields.email && owner0.owner_email) {
            item.fields.email = normalizeEmail(owner0.owner_email);
            emailFromOwner++;
            item.emailSource = 'form.owners';
          }
          if (!item.fields.contact && (owner0.owner_firstname || owner0.owner_lastname)) {
            item.fields.contact = [owner0.owner_firstname, owner0.owner_lastname].filter(Boolean).join(' ');
          }
        } else {
          formFetchErrors++;
        }
      } catch {
        formFetchErrors++;
      }

      try {
        const sigRes = await fetch(`${mspBase}/applications/${appNo}/signatures`, { headers: mspHeaders });
        if (sigRes.ok) {
          const sigData = await sigRes.json().catch(() => ({}));
          const signers = Array.isArray(sigData?.signers) ? sigData.signers : [];
          item.signers = signers;
          signaturesOk++;
          const primary = signers.find((s: any) => s.emailAddress) || signers[0];
          if (primary?.emailAddress && !item.fields.email) {
            item.fields.email = normalizeEmail(primary.emailAddress);
            emailFromSigner++;
            item.emailSource = 'signatures';
          }
          if (primary?.name && !item.fields.contact) {
            item.fields.contact = String(primary.name).trim();
          }
        } else {
          signaturesMiss++;
        }
      } catch {
        signaturesMiss++;
      }
      return null;
    });

    for (const item of importable) {
      if (item.fields.tin && !item.tinSource) item.tinSource = 'merchant.federal_tax_id';
      if (item.fields.email && !item.emailSource) item.emailSource = 'merchant.email';
    }

    // ── 3. Nested groups: owner → legal entity → mids ───────────────────────
    type MidItem = typeof importable[0];
    const ownerGroups = new Map<string, Map<string, MidItem[]>>();

    for (const item of importable) {
      const ok = ownerKeyOf(item.fields);
      const lk = legalKeyOf(item.fields);
      if (!ok || !lk) continue;
      if (!ownerGroups.has(ok)) ownerGroups.set(ok, new Map());
      const legals = ownerGroups.get(ok)!;
      if (!legals.has(lk)) legals.set(lk, []);
      legals.get(lk)!.push(item);
    }

    // ── 4. Existing Base44 ──────────────────────────────────────────────────
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
      if (p.legalName) profileByName.set(normalizeNameKey(p.legalName), p);
      if (p.corporateId) profileByCorporateId.set(String(p.corporateId), p);
    }

    const accountByEin = new Map<string, any>();
    const accountByEmail = new Map<string, any>();
    const accountByName = new Map<string, any>();
    for (const a of allAccounts || []) {
      if (a.primaryContactEmail) accountByEmail.set(normalizeEmail(a.primaryContactEmail), a);
      if (a.name) accountByName.set(normalizeNameKey(a.name), a);
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

    const uniqueEmails = new Set(importable.map((i) => i.fields.email).filter(Boolean));
    const summary = {
      source: 'merchants',
      hierarchy: 'owner_email → legal_entity → mid',
      merchantsScanned: merchantsPage.items.length,
      merchantsWithMid: uniqueMids.length,
      importableMerchants: importable.length,
      merchantFetchErrors,
      formFetchErrors,
      signaturesOk,
      signaturesMiss,
      tinFromMerchant: importable.filter((i) => String(i.tinSource || '').startsWith('merchant')).length,
      tinFromForm,
      tinUnavailable: importable.filter((i) => !i.fields.tin).length,
      emailFromMerchant: importable.filter((i) => i.emailSource === 'merchant.email').length,
      emailFromSigner,
      emailFromOwner,
      uniqueOwnerEmails: uniqueEmails.size,
      ownerGroups: ownerGroups.size,
      legalEntityGroups: [...ownerGroups.values()].reduce((n, m) => n + m.size, 0),
      applicationsScanned: appsPage.items?.length || 0,
      applicationsMatchedByMid: importable.filter((i) => appByMid.has(i.mid)).length,
      // legacy UI keys
      mspAppsScanned: appsPage.items?.length || 0,
      approvedWithMid: importable.length,
      groups: ownerGroups.size,
      accounts: { created: 0, linked: 0 },
      corporateEntities: { found: 0, created: 0, skipped: 0, linkedToAccount: 0 },
      locations: { created: 0, skipped: 0 },
      merchantMIDs: { created: 0, skipped: 0, errors: 0 },
    };
    const entityResults: any[] = [];

    // ── 5. Write / dry-run per owner ────────────────────────────────────────
    for (const [ownerKey, legalMap] of ownerGroups) {
      const allOwnerItems = [...legalMap.values()].flat();
      const rep = allOwnerItems[0];
      const ownerEmail = rep.fields.email || '';
      const ownerContact = rep.fields.contact || '';
      const accountName = accountDisplayName({
        contact: ownerContact,
        email: ownerEmail,
        corporateName: rep.fields.corporateName,
      });

      // Prefer email link, then any EIN under this owner, then contact name
      let account =
        (ownerEmail && accountByEmail.get(ownerEmail))
        || allOwnerItems.map((i) => i.fields.tin).filter(Boolean).map((t) => accountByEin.get(t)).find(Boolean)
        || accountByName.get(normalizeNameKey(accountName))
        || null;
      let accountCreated = false;

      // Build legalEntities union for this owner
      const legalEntitiesPayload: any[] = [];
      const seenEntityKeys = new Set<string>();
      for (const [, items] of legalMap) {
        const f = items[0].fields;
        const ek = legalKeyOf(f);
        if (seenEntityKeys.has(ek)) continue;
        seenEntityKeys.add(ek);
        legalEntitiesPayload.push({
          entityId: newEntityId(),
          legalBusinessName: f.corporateName || f.dba,
          federalEIN: f.tin || '',
          mailingStreet: f.street || '',
          mailingCity: f.city || '',
          mailingState: f.state || '',
          mailingZip: f.zip || '',
        });
      }

      if (account) {
        summary.accounts.linked++;
        if (!dryRun) {
          const patch: Record<string, unknown> = {};
          if (ownerEmail && !account.primaryContactEmail) patch.primaryContactEmail = ownerEmail;
          if (ownerContact && !account.primaryContactName) patch.primaryContactName = ownerContact;
          const existing = parseEntities(account.legalEntities);
          const existingEins = new Set(existing.map((e: any) => cleanDigits(e.federalEIN || '')).filter(Boolean));
          const existingNames = new Set(existing.map((e: any) => normalizeNameKey(e.legalBusinessName || '')).filter(Boolean));
          let merged = false;
          for (const le of legalEntitiesPayload) {
            const ein = cleanDigits(le.federalEIN || '');
            const nk = normalizeNameKey(le.legalBusinessName || '');
            if ((ein && existingEins.has(ein)) || (nk && existingNames.has(nk))) continue;
            existing.push(le);
            merged = true;
          }
          if (merged) patch.legalEntities = existing;
          if (Object.keys(patch).length) {
            account = await base44.asServiceRole.entities.MerchantAccount.update(account.id, patch);
          }
        }
      } else {
        const accountPayload = {
          name: accountName,
          domain: ownerEmail.includes('@') ? ownerEmail.split('@')[1] : null,
          hubspotCompanyId: null,
          primaryContactEmail: ownerEmail || null,
          primaryContactName: ownerContact || null,
          legalEntities: legalEntitiesPayload.filter((le) => le.federalEIN || le.legalBusinessName),
        };
        if (!dryRun) {
          account = await base44.asServiceRole.entities.MerchantAccount.create(accountPayload);
          if (ownerEmail) accountByEmail.set(ownerEmail, account);
          accountByName.set(normalizeNameKey(accountName), account);
          for (const le of legalEntitiesPayload) {
            const ein = cleanDigits(le.federalEIN || '');
            if (ein) accountByEin.set(ein, account);
          }
        } else {
          account = { id: `[dry-run-account:${ownerKey}]`, ...accountPayload };
        }
        accountCreated = true;
        summary.accounts.created++;
      }

      const merchantAccountId = account.id;
      const legalResults: any[] = [];

      for (const [legalKey, items] of legalMap) {
        const f = items[0].fields;
        const form = items[0].form || {};
        const tin = f.tin || '';
        const legalName = (f.corporateName || f.dba || '').trim();
        const ownershipCode = form.ownership_type || 'CO';
        const primaryOwner = (form.owners || [])[0] || {};
        const dob = parseDob(primaryOwner.owner_dob || '');
        const email = f.email || normalizeEmail(primaryOwner.owner_email || form.business_email || '');
        const phone = f.phone || cleanDigits(form.business_phone || '');
        const taxClassType = mspLlcClassToTaxClass(ownershipCode, form.llc_class || '');
        const nameKey = normalizeNameKey(legalName);
        const corporateIdStable = stableMspCorporateId(tin, legalName, items[0].mid);

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
          } else {
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
            signerEmail: email || `import+msp-${slugCorp(legalName).slice(0, 12)}@cliqbux.com`,
            taxId: tin || null,
            ownershipType: mspOwnershipToInternal(ownershipCode),
            ...(taxClassType ? { taxClassType } : {}),
            firstName: primaryOwner.owner_firstname || f.contactFirst || contactParts[0] || '',
            lastName: primaryOwner.owner_lastname || f.contactLast || contactParts.slice(1).join(' ') || '',
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

        for (const item of items) {
          const { mid, fields } = item;
          const itemForm = item.form || {};
          const appNo = item.appNo || (appByMid.get(mid)?.merchantapplicationno
            ? String(appByMid.get(mid).merchantapplicationno) : '');

          if (trackedMids.has(mid) || (appNo && trackedAppNos.has(appNo))) {
            summary.merchantMIDs.skipped++;
            midResults.push({ mid, appNo: appNo || null, dba: fields.dba, result: 'mid_already_tracked' });
            continue;
          }

          const street = (fields.street || itemForm.business_address || '').trim().toLowerCase();
          const zip = cleanDigits(fields.zip || itemForm.business_zipcode || '');
          let location = existingLocations.find((l: any) => {
            const ls = (l.businessStreet || l.businessAddress || '').trim().toLowerCase();
            const lz = cleanDigits(l.businessZip || '');
            return ls && ls === street && lz === zip;
          });

          if (!location) {
            const locationPayload = {
              corporateId,
              dbaName: fields.dba || fields.corporateName,
              businessStreet: fields.street || itemForm.business_address || '',
              businessCity: fields.city || itemForm.business_city || '',
              businessState: fields.state || itemForm.business_state_usa || '',
              businessZip: fields.zip || itemForm.business_zipcode || '',
              businessAddress: [
                fields.street || itemForm.business_address,
                fields.city || itemForm.business_city,
                fields.state || itemForm.business_state_usa,
                fields.zip || itemForm.business_zipcode,
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
            mccCode: fields.mcc || itemForm.mcc || '',
            industryType: itemForm.industry_type || 'RE',
            pricingCategory: itemForm.pricing_category || '1',
            pricingMethod: itemForm.pricing_method || 'ICPLS',
            monthlyCardSales: itemForm.monthly_sales ? parseFloat(itemForm.monthly_sales) : null,
            avgSaleAmount: itemForm.average_sales ? parseFloat(itemForm.average_sales) : null,
            highestTicketAmount: itemForm.highest_ticket ? parseFloat(itemForm.highest_ticket) : null,
            cardPresentPct: itemForm.cp_percent ? parseFloat(itemForm.cp_percent) : 100,
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
              mid, appNo: appNo || null, dba: fields.dba,
              result: dryRun ? 'would_create' : 'created',
            });
          } catch (err: any) {
            summary.merchantMIDs.errors++;
            midResults.push({ mid, dba: fields.dba, result: 'error', error: err.message });
          }
        }

        legalResults.push({
          legalKey,
          legalName,
          tin: tin ? `***${tin.slice(-4)}` : null,
          tinSource: items[0].tinSource || null,
          corporateId,
          profileCreated,
          midCount: items.length,
          mids: midResults,
        });
      }

      entityResults.push({
        groupKey: ownerKey,
        ownerKey,
        ownerEmail: ownerEmail || null,
        ownerContact: ownerContact || null,
        emailSource: rep.emailSource || null,
        legalName: accountName,
        tin: null,
        tinUnavailable: allOwnerItems.every((i) => !i.fields.tin),
        corporateId: legalResults[0]?.corporateId || null,
        merchantAccountId: dryRun && accountCreated ? account.id : merchantAccountId,
        accountCreated,
        profileCreated: legalResults.some((l) => l.profileCreated),
        mspRef: true,
        midCount: allOwnerItems.length,
        legalEntityCount: legalMap.size,
        legalEntities: legalResults,
        apps: legalResults.flatMap((l) => l.mids),
      });
    }

    return Response.json({
      success: true,
      dryRun,
      confirmLive: !dryRun,
      hubspot: false,
      source: 'merchants',
      hierarchy: 'owner_email → legal_entity → mid',
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
