import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * probeMSPMerchantData — admin read-only diagnostic for MSP Merchants API vs applications.
 *
 * Confirms GET /merchants (+ GET /merchants/{mid}) shape and coverage vs GET /applications.
 * Never writes Base44 or MSP. Never returns full TIN/SSN (last-4 only).
 *
 * POST {} optional { sampleSize?: number, mids?: string[] }
 */

function cleanDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

function last4(s: string): string | null {
  const d = cleanDigits(s);
  return d.length >= 4 ? `***${d.slice(-4)}` : null;
}

function pick(obj: any, keys: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  // case-insensitive fallback
  const lower = Object.fromEntries(
    Object.keys(obj).map((k) => [k.toLowerCase(), obj[k]]),
  );
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v != null && v !== '') return v;
  }
  return undefined;
}

function extractList(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['merchants', 'data', 'items', 'results', 'Applications', 'applications']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function pagesOf(data: any): number {
  const p = data?.pages ?? data?.total_pages ?? data?.totalPages;
  return typeof p === 'number' && p > 0 ? p : 1;
}

function midOf(row: any): string {
  return String(pick(row, ['mid', 'MID', 'merchant_id', 'merchantId', 'elavon_mid']) || '').trim();
}

function statusOf(row: any): string {
  return String(
    pick(row, ['status', 'Status', 'merchant_status', 'merchantStatus', 'application_status']) || 'unknown',
  );
}

function taxLikeKeys(obj: any, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const hits: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (/tin|ssn|ein|tax|federal/i.test(k) && v != null && String(v).trim() !== '') {
      hits.push(path);
    }
    if (k === 'owners' && Array.isArray(v)) {
      v.forEach((o, i) => hits.push(...taxLikeKeys(o, `${path}[${i}]`)));
    }
  }
  return hits;
}

function firstAddress(src: any) {
  const addrs = Array.isArray(src.addresses) ? src.addresses : [];
  const a = addrs.find((x: any) => x && (x.address_line_1 || x.city)) || addrs[0] || {};
  return {
    address: a.address_line_1 || pick(src, ['address', 'Address', 'business_address', 'street']),
    city: a.city || pick(src, ['city', 'City', 'business_city']),
    state: a.state || pick(src, ['state', 'State', 'business_state']),
    zip: a.postal_code || pick(src, ['zip', 'Zip', 'zipcode']),
  };
}

function safeMerchantView(detail: any): Record<string, unknown> {
  if (!detail || typeof detail !== 'object') return {};
  const src = detail.merchant && typeof detail.merchant === 'object' ? detail.merchant : detail;
  const first = String(pick(src, ['contact_firstname']) || '');
  const last = String(pick(src, ['contact_lastname']) || '');
  const addr = firstAddress(src);
  const tinRaw = String(pick(src, [
    'federal_tax_id', 'federalTaxId', 'tin', 'TIN', 'ssn', 'ein', 'EIN', 'federal_ein',
  ]) || '');
  return {
    mid: midOf(src),
    status: statusOf(src),
    dba: pick(src, ['name', 'dba', 'Merchant', 'merchant_name', 'full_dba_name']),
    corporateName: pick(src, [
      'corporate_name', 'corporateName', 'legal_name', 'legalName', 'company_name',
    ]),
    contact: pick(src, ['contact_name', 'contactName', 'contact']) || [first, last].filter(Boolean).join(' '),
    email: pick(src, ['email', 'Email', 'business_email', 'contact_email']),
    phone: pick(src, ['phone', 'Phone', 'business_phone']),
    ...addr,
    elavonAppId: pick(src, ['elavonappid', 'elavon_app_id']),
    sic: pick(src, ['mcc', 'sic', 'SIC Code', 'sic_code']),
    topKeys: Object.keys(src).slice(0, 40),
    taxLikeKeys: taxLikeKeys(src).slice(0, 20),
    tinLast4: last4(tinRaw),
    hasFederalTaxId: Boolean(cleanDigits(tinRaw)),
  };
}

async function paginate(
  mspBase: string,
  path: string,
  headers: Record<string, string>,
  listKeyHint: string,
): Promise<{ ok: boolean; status: number; items: any[]; rawKeys: string[]; pages: number; firstPageSample: any }> {
  let all: any[] = [];
  let page = 1;
  let status = 0;
  let rawKeys: string[] = [];
  let pages = 1;
  let firstPageSample: any = null;

  while (true) {
    const url = `${mspBase}${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`;
    const res = await fetch(url, { headers });
    status = res.status;
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { _parseError: true, _raw: text.slice(0, 200) }; }

    if (page === 1) {
      rawKeys = data && typeof data === 'object' ? Object.keys(data) : [];
      firstPageSample = data;
      pages = pagesOf(data);
    }

    if (!res.ok) {
      return { ok: false, status, items: all, rawKeys, pages, firstPageSample };
    }

    const batch = extractList(data);
    // If empty but single object with mid, treat as one
    if (!batch.length && midOf(data)) {
      all.push(data);
      break;
    }
    all = all.concat(batch);
    if (!batch.length || page >= pages) break;
    page++;
    if (page > 50) break; // safety
  }

  // Try without pagination if first page empty but 200
  if (!all.length && status === 200 && firstPageSample) {
    const bare = await fetch(`${mspBase}${path}`, { headers });
    status = bare.status;
    const data = await bare.json().catch(() => ({}));
    rawKeys = data && typeof data === 'object' ? Object.keys(data) : rawKeys;
    all = extractList(data);
    firstPageSample = data;
  }

  void listKeyHint;
  return { ok: status >= 200 && status < 300, status, items: all, rawKeys, pages, firstPageSample };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin role required' }, { status: 403 });
    }

    const body = req.method === 'POST' ? (await req.json().catch(() => ({}))) || {} : {};
    const sampleSize = Math.min(Math.max(Number(body.sampleSize) || 8, 1), 20);
    const extraMids: string[] = Array.isArray(body.mids)
      ? body.mids.map((m: any) => String(m).trim()).filter(Boolean).slice(0, 20)
      : [];

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const headers = { 'X-API-KEY': apiKey, 'X-App-ID': appId, Accept: 'application/json' };

    // ── Merchants list ──────────────────────────────────────────────────────
    const merchantsList = await paginate(mspBase, '/merchants', headers, 'merchants');

    const merchantsByStatus: Record<string, number> = {};
    let merchantsWithMid = 0;
    for (const m of merchantsList.items) {
      const st = statusOf(m);
      merchantsByStatus[st] = (merchantsByStatus[st] || 0) + 1;
      if (midOf(m)) merchantsWithMid++;
    }

    // ── Applications list (comparison) ──────────────────────────────────────
    const appsList = await paginate(mspBase, '/applications', headers, 'applications');
    const appsByStatus: Record<string, number> = {};
    let appsWithMid = 0;
    let appsApprovedWithMid = 0;
    for (const a of appsList.items) {
      const st = String(a.application_status || 'unknown');
      appsByStatus[st] = (appsByStatus[st] || 0) + 1;
      if (a.mid) {
        appsWithMid++;
        if (['Approved', 'Complete'].includes(st)) appsApprovedWithMid++;
      }
    }

    // ── Sample merchant detail + owner cluster (all MIDs, batched) ──────────
    const listMids = merchantsList.items.map(midOf).filter(Boolean);
    const allUniqueMids = [...new Set([...extraMids, ...listMids])];
    const sampleMids = allUniqueMids.slice(0, sampleSize);

    const detailSamples: any[] = [];
    const ownerByEmail = new Map<string, { mids: string[]; corps: Set<string>; contact: string }>();
    let withFederalTaxId = 0;
    let withEmail = 0;
    let detailOkAll = 0;

    // Full pass for clustering (batched)
    for (let i = 0; i < allUniqueMids.length; i += 8) {
      const batch = allUniqueMids.slice(i, i + 8);
      await Promise.all(batch.map(async (mid) => {
        const res = await fetch(`${mspBase}/merchants/${encodeURIComponent(mid)}`, { headers });
        const text = await res.text();
        let data: any = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
        const view = res.ok ? safeMerchantView(data) : null;
        if (res.ok) detailOkAll++;
        if (sampleMids.includes(mid)) {
          detailSamples.push({
            mid,
            httpStatus: res.status,
            ok: res.ok,
            view,
            errorSnippet: res.ok ? null : text.slice(0, 200),
          });
        }
        if (!view) return;
        if (view.hasFederalTaxId) withFederalTaxId++;
        const email = String(view.email || '').trim().toLowerCase();
        if (email) {
          withEmail++;
          if (!ownerByEmail.has(email)) {
            ownerByEmail.set(email, { mids: [], corps: new Set(), contact: String(view.contact || '') });
          }
          const o = ownerByEmail.get(email)!;
          o.mids.push(mid);
          if (view.corporateName) o.corps.add(String(view.corporateName));
        }
      }));
    }

    const multiMidEmails = [...ownerByEmail.entries()].filter(([, v]) => v.mids.length >= 2);
    const multiCorpEmails = [...ownerByEmail.entries()].filter(([, v]) => v.corps.size >= 2);

    // ── Form + signatures sample (apps with MID) ────────────────────────────
    const approvedApps = appsList.items.filter(
      (a: any) => ['Approved', 'Complete'].includes(a.application_status) && a.mid,
    ).slice(0, Math.min(sampleSize, 6));

    let formsWithTin = 0;
    let signaturesOk = 0;
    let signaturesMiss = 0;
    const formSamples: any[] = [];
    for (const app of approvedApps) {
      const appNo = app.merchantapplicationno;
      try {
        const res = await fetch(`${mspBase}/applications/${appNo}/form`, { headers });
        const data = await res.json().catch(() => ({}));
        const form = data?.form || {};
        const tin = form.tin || form.ssn || '';
        const taxKeys = taxLikeKeys(form);
        if (cleanDigits(tin) || taxKeys.length) formsWithTin++;

        let sig: any = null;
        try {
          const sigRes = await fetch(`${mspBase}/applications/${appNo}/signatures`, { headers });
          if (sigRes.ok) {
            signaturesOk++;
            const sigData = await sigRes.json().catch(() => ({}));
            const signers = Array.isArray(sigData?.signers) ? sigData.signers : [];
            sig = {
              envelopeStatus: sigData?.envelopeStatus,
              signerCount: signers.length,
              signers: signers.slice(0, 3).map((s: any) => ({
                name: s.name,
                emailLast: s.emailAddress ? String(s.emailAddress).replace(/(.{2}).+(@.+)/, '$1…$2') : null,
              })),
            };
          } else {
            signaturesMiss++;
          }
        } catch {
          signaturesMiss++;
        }

        formSamples.push({
          appNo,
          mid: app.mid,
          httpStatus: res.status,
          tinLast4: last4(tin),
          taxLikeKeys: taxKeys.slice(0, 15),
          signatures: sig,
        });
      } catch (err: any) {
        formSamples.push({ appNo, error: err.message });
      }
    }

    const merchantsBaselineCsv = 106; // Merchants_2026-07-30_190910.csv Approved+MID

    return Response.json({
      success: true,
      mspBase,
      merchants: {
        listOk: merchantsList.ok,
        listHttpStatus: merchantsList.status,
        responseKeys: merchantsList.rawKeys,
        pages: merchantsList.pages,
        total: merchantsList.items.length,
        withMid: merchantsWithMid,
        byStatus: merchantsByStatus,
        sampleListRowKeys: merchantsList.items[0] ? Object.keys(merchantsList.items[0]).slice(0, 40) : [],
        sampleListRow: merchantsList.items[0]
          ? safeMerchantView(merchantsList.items[0])
          : null,
      },
      applications: {
        listOk: appsList.ok,
        listHttpStatus: appsList.status,
        total: appsList.items.length,
        withMid: appsWithMid,
        approvedWithMid: appsApprovedWithMid,
        byStatus: appsByStatus,
      },
      coverage: {
        merchantsExportApprovedMidBaseline: merchantsBaselineCsv,
        merchantsApiTotal: merchantsList.items.length,
        merchantsApiWithMid: merchantsWithMid,
        applicationsApprovedWithMid: appsApprovedWithMid,
        gapVsCsv: merchantsBaselineCsv - merchantsWithMid,
        gapAppsVsMerchantsApi: merchantsWithMid - appsApprovedWithMid,
      },
      ownerClustering: {
        detailOk: detailOkAll,
        withEmail,
        withFederalTaxId,
        uniqueEmails: ownerByEmail.size,
        emailsWithMultipleMids: multiMidEmails.length,
        emailsWithMultipleCorps: multiCorpEmails.length,
        topMultiMid: multiMidEmails
          .sort((a, b) => b[1].mids.length - a[1].mids.length)
          .slice(0, 10)
          .map(([email, v]) => ({
            emailHint: email.replace(/(.{2}).+(@.+)/, '$1…$2'),
            contact: v.contact,
            midCount: v.mids.length,
            corpCount: v.corps.size,
            corps: [...v.corps].slice(0, 5),
          })),
      },
      merchantDetails: {
        sampled: detailSamples.length,
        okCount: detailSamples.filter((d) => d.ok).length,
        samples: detailSamples,
      },
      formTinSupplement: {
        sampled: formSamples.length,
        withTaxSignal: formsWithTin,
        signaturesOk,
        signaturesMiss,
        samples: formSamples,
      },
    });
  } catch (error: any) {
    console.error('[probeMSPMerchantData]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
