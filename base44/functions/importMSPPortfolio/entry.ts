import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-31a — force redeploy after MerchantAccount schema republish (taxIdType on legal entities)

/**
 * importMSPPortfolio — MSP Merchants → Merchant Center (Owner → Legal Entity → MID).
 *
 * Rate limits (MSP OpenAPI): ≤10 req/s, ≤60k/day → HTTP 429.
 * This gate runs at ≤8 req/s; every 429 is counted and surfaced (never silent).
 *
 * POST { dryRun: true } | { confirmLive: true, ownerOffset?, ownerLimit? }
 * Live sync is chunked by owner (default 8/call). UI loops until done=true.
 */

const MSP_MAX_RPS = 8;
const MSP_MIN_GAP_MS = Math.ceil(1000 / MSP_MAX_RPS); // 125ms
const MSP_SESSION_BUDGET = 5000;
const MSP_429_MAX_RETRIES = 4;
/** Space Base44 asServiceRole writes to avoid account-wide rate limits (AGENTS Lesson #2). */
const BASE44_WRITE_GAP_MS = 120;
const BASE44_RATE_RETRIES = 3;
/** Default owners per live invocation — UI loops until done. */
const LIVE_OWNER_LIMIT_DEFAULT = 8;

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Throttle + retry Base44 entity writes on "Rate limit exceeded". */
async function base44Write<T>(fn: () => Promise<T>, label = 'write'): Promise<T> {
  let attempt = 0;
  while (true) {
    await sleep(BASE44_WRITE_GAP_MS);
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (/rate limit/i.test(msg) && attempt < BASE44_RATE_RETRIES) {
        attempt++;
        console.warn(`[importMSPPortfolio] Base44 rate limit on ${label}; retry ${attempt}/${BASE44_RATE_RETRIES}`);
        await sleep(1000 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
}

/** Classify tax id: sole prop → SSN; otherwise EIN when digits present. */
function classifyTaxIdType(opts: {
  tin: string;
  source?: string | null;
  ownershipCode?: string | null;
}): 'EIN' | 'SSN' | null {
  if (!opts.tin || opts.tin.length < 4) return null;
  const src = String(opts.source || '').toLowerCase();
  if (src.includes('ssn') || src.includes('owners.ssn')) return 'SSN';
  if (String(opts.ownershipCode || '').toUpperCase() === 'SP') return 'SSN';
  return 'EIN';
}

function taxIdLabel(tin: string, taxIdType: string | null): string {
  if (!tin) return '—';
  const kind = taxIdType === 'SSN' ? 'SSN' : taxIdType === 'EIN' ? 'EIN' : 'Tax ID';
  return `${kind} ***${tin.slice(-4)}`;
}

function firstAddress(m: any) {
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
  const dba = String(pick(m, ['name', 'dba', 'Merchant', 'merchant_name', 'merchantName', 'full_dba_name']) || '').trim();
  const corporateNameRaw = String(pick(m, [
    'corporate_name', 'corporateName', 'Corporate Name', 'legal_name', 'legalName',
    'legal_dba_name', 'company_name', 'companyName',
  ]) || '').trim();
  const corporateName = corporateNameRaw || dba;
  const first = String(pick(m, ['contact_firstname', 'contactFirstname']) || '').trim();
  const last = String(pick(m, ['contact_lastname', 'contactLastname']) || '').trim();
  const contact = String(
    pick(m, ['contact_name', 'contactName', 'contact', 'Contact']) || [first, last].filter(Boolean).join(' ') || '',
  ).trim();
  const email = normalizeEmail(String(pick(m, ['email', 'Email', 'business_email', 'contact_email']) || ''));
  const phone = cleanDigits(String(pick(m, ['phone', 'Phone', 'business_phone', 'contact_phone']) || ''));
  const addr = firstAddress(m);
  const mcc = String(pick(m, ['mcc', 'mcc_code', 'sic', 'SIC Code', 'sic_code']) || '').trim();
  const status = statusOf(m);
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
  if (form.ssn && cleanDigits(form.ssn)) return { tin: cleanDigits(form.ssn), source: 'form.ssn' };
  if (form.tin && cleanDigits(form.tin)) return { tin: cleanDigits(form.tin), source: 'form.tin' };
  for (const o of Array.isArray(form.owners) ? form.owners : []) {
    const ssn = cleanDigits(o?.owner_ssn || o?.ssn || '');
    if (ssn) return { tin: ssn, source: 'owners.ssn' };
    const otin = cleanDigits(o?.owner_tin || '');
    if (otin) return { tin: otin, source: 'owners.tin' };
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

function isCliqbuxTestMid(fields: { dba?: string; corporateName?: string }): boolean {
  const s = `${fields.dba || ''} ${fields.corporateName || ''}`.toUpperCase();
  return /CLIQBUX/.test(s) && /(LIVE|EQUIPMENT|TEST)/.test(s);
}

/** MSP HTTP gate: ≤8 req/s, counts requests + 429s, retries 429 with backoff. */
class MspRateGate {
  mspRequestCount = 0;
  rateLimit429Count = 0;
  private lastAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private budget = MSP_SESSION_BUDGET) {}

  private async throttle() {
    const run = async () => {
      if (this.mspRequestCount >= this.budget) {
        throw new Error(
          `MSP session budget exceeded (${this.budget} requests). Soft cap under 60k/day limit.`,
        );
      }
      const now = Date.now();
      const wait = Math.max(0, MSP_MIN_GAP_MS - (now - this.lastAt));
      if (wait > 0) await sleep(wait);
      this.lastAt = Date.now();
      this.mspRequestCount++;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    await next;
  }

  async fetch(url: string, init: RequestInit, label = ''): Promise<Response> {
    let attempt = 0;
    while (true) {
      await this.throttle();
      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (err: any) {
        if (attempt >= MSP_429_MAX_RETRIES) throw err;
        attempt++;
        await sleep(1000 * attempt);
        continue;
      }
      if (res.status === 429) {
        this.rateLimit429Count++;
        const path = label || url.replace(/^https?:\/\/[^/]+/, '');
        console.warn(`[msp] HTTP 429 path=${path} attempt=${attempt + 1} total429=${this.rateLimit429Count}`);
        if (attempt >= MSP_429_MAX_RETRIES) return res;
        const retryAfter = Number(res.headers.get('Retry-After') || '');
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt);
        attempt++;
        await sleep(backoff);
        continue;
      }
      return res;
    }
  }

  stats() {
    return {
      mspRequestCount: this.mspRequestCount,
      rateLimit429Count: this.rateLimit429Count,
    };
  }
}

async function batchedParallel<T>(items: T[], concurrency: number, fn: (item: T) => Promise<any>): Promise<any[]> {
  const results: any[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

async function paginateAll(
  gate: MspRateGate,
  mspBase: string,
  path: string,
  headers: Record<string, string>,
) {
  let all: any[] = [];
  let page = 1;
  let status = 0;
  while (true) {
    const url = `${mspBase}${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`;
    const res = await gate.fetch(url, { headers }, path);
    status = res.status;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (page === 1) {
        const bare = await gate.fetch(`${mspBase}${path}`, { headers }, path);
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

/** Second-pass: unify by tax id, then absorb orphans by corporate_name. */
function mergeImportableItems(items: any[]): { items: any[]; mergeNotes: string[] } {
  const mergeNotes: string[] = [];
  const byTin = new Map<string, any[]>();
  for (const it of items) {
    const tin = it.fields.tin;
    if (tin && tin.length >= 4) {
      if (!byTin.has(tin)) byTin.set(tin, []);
      byTin.get(tin)!.push(it);
    }
  }

  // Canonical owner for each tax id = email group with most MIDs (else richest contact)
  for (const [tin, group] of byTin) {
    if (group.length < 2) continue;
    const byOwner = new Map<string, any[]>();
    for (const it of group) {
      const ok = ownerKeyOf(it.fields) || `mid:${it.mid}`;
      if (!byOwner.has(ok)) byOwner.set(ok, []);
      byOwner.get(ok)!.push(it);
    }
    if (byOwner.size < 2) continue;
    let bestKey = '';
    let bestList: any[] = [];
    for (const [k, list] of byOwner) {
      if (list.length > bestList.length || (list.length === bestList.length && list[0].fields.email)) {
        bestKey = k;
        bestList = list;
      }
    }
    const canon = bestList[0];
    const altEmails = new Set<string>();
    for (const [k, list] of byOwner) {
      if (k === bestKey) continue;
      for (const it of list) {
        if (it.fields.email) altEmails.add(it.fields.email);
        it.fields.email = canon.fields.email || it.fields.email;
        it.fields.contact = canon.fields.contact || it.fields.contact;
        it.mergedBy = 'tax_id';
        it.canonicalOwnerKey = ownerKeyOf(canon.fields);
      }
    }
    mergeNotes.push(
      `tax_id ***${tin.slice(-4)}: unified ${group.length} MIDs under ${canon.fields.email || canon.fields.contact || bestKey}`
      + (altEmails.size ? ` (also: ${[...altEmails].join(', ')})` : ''),
    );
  }

  // Build corporate_name → rich template (has email or tin)
  const richByCorp = new Map<string, any>();
  for (const it of items) {
    const ck = normalizeNameKey(it.fields.corporateName || '');
    if (!ck) continue;
    const rich = !!(it.fields.email || it.fields.tin);
    if (!rich) continue;
    const prev = richByCorp.get(ck);
    if (!prev || (it.fields.tin && !prev.fields.tin) || (it.fields.email && !prev.fields.email)) {
      richByCorp.set(ck, it);
    }
  }

  for (const it of items) {
    if (it.fields.email && it.fields.tin) continue;
    const ck = normalizeNameKey(it.fields.corporateName || '');
    if (!ck) continue;
    const rich = richByCorp.get(ck);
    if (!rich || rich.mid === it.mid) continue;
    if (!it.fields.email && rich.fields.email) {
      it.fields.email = rich.fields.email;
      it.emailSource = it.emailSource || 'merged.corporate_name';
      it.mergedBy = it.mergedBy || 'corporate_name';
    }
    if (!it.fields.contact && rich.fields.contact) {
      it.fields.contact = rich.fields.contact;
    }
    if (!it.fields.tin && rich.fields.tin) {
      it.fields.tin = rich.fields.tin;
      it.tinSource = it.tinSource || rich.tinSource || 'merged.corporate_name';
      it.taxIdType = it.taxIdType || rich.taxIdType;
      it.mergedBy = it.mergedBy || 'corporate_name';
    }
  }

  return { items, mergeNotes };
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
    const gate = new MspRateGate();
    console.log(`[importMSPPortfolio] Starting${dryRun ? ' DRY RUN' : ' LIVE'} (≤${MSP_MAX_RPS} req/s)...`);

    // ── 1. Merchants list + detail ──────────────────────────────────────────
    const merchantsPage = await paginateAll(gate, mspBase, '/merchants', mspHeaders);
    if (!merchantsPage.ok) {
      return Response.json({
        error: `GET /merchants failed HTTP ${merchantsPage.status}`,
        hint: 'Run probeMSPMerchantData.',
        ...gate.stats(),
      }, { status: 502 });
    }

    const listWithMid = merchantsPage.items.filter((r) => midOf(r));
    const uniqueMids = [...new Set(listWithMid.map(midOf))];
    let merchantFetchErrors = 0;

    const detailed = await batchedParallel(uniqueMids, 2, async (mid: string) => {
      const listRow = listWithMid.find((r) => midOf(r) === mid) || { mid };
      try {
        const res = await gate.fetch(
          `${mspBase}/merchants/${encodeURIComponent(mid)}`,
          { headers: mspHeaders },
          `/merchants/${mid}`,
        );
        if (!res.ok) {
          merchantFetchErrors++;
          console.warn(`[importMSPPortfolio] merchant ${mid} HTTP ${res.status}`);
          return { mid, fields: mapMerchantFields(listRow), detailOk: false };
        }
        const data = await res.json().catch(() => ({}));
        const fields = mapMerchantFields(data);
        if (!fields.mid) fields.mid = mid;
        const fromList = mapMerchantFields(listRow);
        for (const k of ['dba', 'corporateName', 'contact', 'email', 'phone', 'street', 'city', 'state', 'zip', 'mcc', 'status', 'tin'] as const) {
          if (!(fields as any)[k] && (fromList as any)[k]) (fields as any)[k] = (fromList as any)[k];
        }
        const tinSource = fields.tin ? 'merchant.federal_tax_id' : null;
        const taxIdType = classifyTaxIdType({ tin: fields.tin, source: tinSource });
        return { mid, fields, detailOk: true, tinSource, taxIdType };
      } catch (err: any) {
        merchantFetchErrors++;
        console.warn(`[importMSPPortfolio] merchant ${mid}: ${err.message}`);
        return { mid, fields: mapMerchantFields(listRow), detailOk: false };
      }
    });

    let importable = detailed.filter((d) => d.fields.mid && isImportableStatus(d.fields.status));

    // ── 2. Applications bridge + form / signatures ──────────────────────────
    const appsPage = await paginateAll(gate, mspBase, '/applications', mspHeaders);
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
      const eid = d.fields.elavonAppId;
      return eid && (/^\d+$/.test(eid) || appByNo.has(eid));
    });

    await batchedParallel(enrichTargets, 2, async (item: any) => {
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
        const formRes = await gate.fetch(
          `${mspBase}/applications/${appNo}/form`,
          { headers: mspHeaders },
          `/applications/${appNo}/form`,
        );
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
          item.taxIdType = classifyTaxIdType({
            tin: item.fields.tin,
            source: item.tinSource,
            ownershipCode: form.ownership_type,
          });
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
        } else if (formRes.status !== 429) {
          formFetchErrors++;
        } else {
          formFetchErrors++;
        }
      } catch {
        formFetchErrors++;
      }

      try {
        const sigRes = await gate.fetch(
          `${mspBase}/applications/${appNo}/signatures`,
          { headers: mspHeaders },
          `/applications/${appNo}/signatures`,
        );
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
      if (item.fields.tin && !item.taxIdType) {
        item.taxIdType = classifyTaxIdType({
          tin: item.fields.tin,
          source: item.tinSource,
          ownershipCode: item.form?.ownership_type,
        });
      }
      item.skipSuggested = isCliqbuxTestMid(item.fields);
    }

    // ── 3. Second-pass merge ────────────────────────────────────────────────
    const mergeResult = mergeImportableItems(importable);
    importable = mergeResult.items;

    // Re-classify after merge fills tin
    for (const item of importable) {
      if (item.fields.tin && !item.taxIdType) {
        item.taxIdType = classifyTaxIdType({ tin: item.fields.tin, source: item.tinSource });
      }
    }

    // ── 4. Nested groups: owner → legal entity → mids ───────────────────────
    const ownerGroups = new Map<string, Map<string, any[]>>();
    for (const item of importable) {
      const ok = ownerKeyOf(item.fields);
      const lk = legalKeyOf(item.fields);
      if (!ok || !lk) continue;
      if (!ownerGroups.has(ok)) ownerGroups.set(ok, new Map());
      const legals = ownerGroups.get(ok)!;
      if (!legals.has(lk)) legals.set(lk, []);
      legals.get(lk)!.push(item);
    }

    // ── 5. Existing Base44 ──────────────────────────────────────────────────
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
    const withEin = importable.filter((i) => i.taxIdType === 'EIN').length;
    const withSsn = importable.filter((i) => i.taxIdType === 'SSN').length;
    const taxIdUnavailable = importable.filter((i) => !i.fields.tin).length;

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
      ...gate.stats(),
      detailOk: importable.filter((i) => i.detailOk).length,
      tinFromMerchant: importable.filter((i) => String(i.tinSource || '').startsWith('merchant')).length,
      tinFromForm,
      withEin,
      withSsn,
      einMissing: importable.filter((i) => !i.fields.tin || i.taxIdType === 'SSN').length - withSsn < 0
        ? 0
        : importable.filter((i) => !i.fields.tin).length, // keep simple below
      ssnPresent: withSsn,
      taxIdUnavailable,
      tinUnavailable: taxIdUnavailable,
      emailFromMerchant: importable.filter((i) => i.emailSource === 'merchant.email').length,
      emailFromSigner,
      emailFromOwner,
      uniqueOwnerEmails: uniqueEmails.size,
      ownerGroups: ownerGroups.size,
      legalEntityGroups: [...ownerGroups.values()].reduce((n, m) => n + m.size, 0),
      mergeNotes: mergeResult.mergeNotes,
      mergedByTaxId: importable.filter((i) => i.mergedBy === 'tax_id').length,
      mergedByCorporateName: importable.filter((i) => i.mergedBy === 'corporate_name').length,
      applicationsScanned: appsPage.items?.length || 0,
      applicationsMatchedByMid: importable.filter((i) => appByMid.has(i.mid)).length,
      mspAppsScanned: appsPage.items?.length || 0,
      approvedWithMid: importable.length,
      groups: ownerGroups.size,
      accounts: { created: 0, linked: 0 },
      corporateEntities: { found: 0, created: 0, skipped: 0, linkedToAccount: 0 },
      locations: { created: 0, skipped: 0 },
      merchantMIDs: { created: 0, skipped: 0, errors: 0 },
      writeErrors: 0,
      writeErrorDetails: [] as string[],
    };
    // Fix einMissing to mean: no EIN among non-SSN (tax id missing for corps)
    summary.einMissing = importable.filter((i) => !i.fields.tin && i.taxIdType !== 'SSN').length;

    const entityResults: any[] = [];

    // ── 6. Write / dry-run per owner (chunked on live) ───────────────────────
    const ownerEntries = [...ownerGroups.entries()];
    const ownersTotal = ownerEntries.length;
    const rawOffset = Number(body?.ownerOffset);
    const rawLimit = Number(body?.ownerLimit);
    const ownerOffset = dryRun ? 0 : (Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0);
    const ownerLimit = dryRun
      ? ownersTotal
      : Math.max(1, Math.min(
        Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : LIVE_OWNER_LIMIT_DEFAULT,
        50,
      ));
    const ownerSlice = dryRun
      ? ownerEntries
      : ownerEntries.slice(ownerOffset, ownerOffset + ownerLimit);
    const nextOwnerOffset = dryRun ? ownersTotal : ownerOffset + ownerSlice.length;
    const batchDone = dryRun || nextOwnerOffset >= ownersTotal;

    for (const [ownerKey, legalMap] of ownerSlice) {
      try {
        const allOwnerItems = [...legalMap.values()].flat();
        const rep = allOwnerItems[0];
        const ownerEmail = rep.fields.email || '';
        const ownerContact = rep.fields.contact || '';
        const accountName = accountDisplayName({
          contact: ownerContact,
          email: ownerEmail,
          corporateName: rep.fields.corporateName,
        });
        const altEmails = [...new Set(
          allOwnerItems.map((i) => i.fields.email).filter((e) => e && e !== ownerEmail),
        )];

        let account =
          (ownerEmail && accountByEmail.get(ownerEmail))
          || allOwnerItems.map((i) => i.fields.tin).filter(Boolean).map((t) => accountByEin.get(t)).find(Boolean)
          || accountByName.get(normalizeNameKey(accountName))
          || null;
        let accountCreated = false;

        const legalEntitiesPayload: any[] = [];
        const seenEntityKeys = new Set<string>();
        for (const [, items] of legalMap) {
          const f = items[0].fields;
          const ek = legalKeyOf(f);
          if (seenEntityKeys.has(ek)) continue;
          seenEntityKeys.add(ek);
          const taxIdType = items[0].taxIdType || classifyTaxIdType({
            tin: f.tin,
            source: items[0].tinSource,
            ownershipCode: items[0].form?.ownership_type,
          });
          legalEntitiesPayload.push({
            entityId: newEntityId(),
            legalBusinessName: f.corporateName || f.dba,
            federalEIN: f.tin || '',
            taxIdType: taxIdType || undefined,
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
              account = await base44Write(
                () => base44.asServiceRole.entities.MerchantAccount.update(account.id, patch),
                `MerchantAccount.update:${account.id}`,
              );
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
            account = await base44Write(
              () => base44.asServiceRole.entities.MerchantAccount.create(accountPayload),
              `MerchantAccount.create:${ownerKey}`,
            );
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
          const taxIdType = items[0].taxIdType || classifyTaxIdType({
            tin, source: items[0].tinSource, ownershipCode: form.ownership_type,
          });
          const legalName = (f.corporateName || f.dba || '').trim();
          const ownershipCode = form.ownership_type || (taxIdType === 'SSN' ? 'SP' : 'CO');
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
              profile = await base44Write(
                () => base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, {
                  merchantAccountId,
                  ...(taxIdType && !profile.taxIdType ? { taxIdType } : {}),
                }),
                `MerchantCorporateProfile.update:${profile.id}`,
              );
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
              ...(taxIdType ? { taxIdType } : {}),
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
              profile = await base44Write(
                () => base44.asServiceRole.entities.MerchantCorporateProfile.create(profilePayload),
                `MerchantCorporateProfile.create:${corporateIdStable}`,
              );
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
                location = await base44Write(
                  () => base44.asServiceRole.entities.MerchantLocations.create(locationPayload),
                  `MerchantLocations.create:${mid}`,
                );
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
                await base44Write(
                  () => base44.asServiceRole.entities.MerchantMID.create(merchantMIDPayload),
                  `MerchantMID.create:${mid}`,
                );
                trackedMids.add(mid);
                if (appNo) trackedAppNos.add(appNo);
              }
              summary.merchantMIDs.created++;
              midResults.push({
                mid, appNo: appNo || null, dba: fields.dba,
                result: dryRun ? 'would_create' : 'created',
                mergedBy: item.mergedBy || null,
                skipSuggested: !!item.skipSuggested,
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
            taxIdType: taxIdType || null,
            taxIdLabel: taxIdLabel(tin, taxIdType),
            tinSource: items[0].tinSource || null,
            corporateId,
            profileCreated,
            midCount: items.length,
            mergedBy: items.some((i: any) => i.mergedBy) ? items.map((i: any) => i.mergedBy).filter(Boolean)[0] : null,
            mids: midResults,
          });
        }

        entityResults.push({
          groupKey: ownerKey,
          ownerKey,
          ownerEmail: ownerEmail || null,
          ownerContact: ownerContact || null,
          alternateEmails: altEmails,
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
          mergedBy: allOwnerItems.some((i) => i.mergedBy) ? [...new Set(allOwnerItems.map((i) => i.mergedBy).filter(Boolean))] : [],
          skipSuggested: allOwnerItems.every((i) => i.skipSuggested),
          legalEntities: legalResults,
          apps: legalResults.flatMap((l) => l.mids),
        });
      } catch (ownerErr: any) {
        const msg = String(ownerErr?.message || ownerErr || 'owner write failed');
        console.error(`[importMSPPortfolio] owner ${ownerKey}:`, ownerErr);
        summary.writeErrors++;
        summary.writeErrorDetails.push(`${ownerKey}: ${msg}`);
        entityResults.push({
          groupKey: ownerKey,
          ownerKey,
          result: 'error',
          error: msg,
          midCount: [...legalMap.values()].flat().length,
          legalEntityCount: legalMap.size,
        });
      }
    }

    return Response.json({
      success: true,
      dryRun,
      confirmLive: !dryRun,
      hubspot: false,
      source: 'merchants',
      hierarchy: 'owner_email → legal_entity → mid',
      ownerOffset,
      ownerLimit: dryRun ? ownersTotal : ownerLimit,
      ownersTotal,
      ownersProcessed: ownerSlice.length,
      nextOwnerOffset,
      done: batchDone,
      rateLimit: {
        maxRps: MSP_MAX_RPS,
        sessionBudget: MSP_SESSION_BUDGET,
        ...gate.stats(),
      },
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