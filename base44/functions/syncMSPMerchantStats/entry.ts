/**
 * syncMSPMerchantStats — admin MSP volume + batches sync (separate from identity import).
 *
 * Modes:
 *   { probe: true, sampleSize? }     — read-only sample of statistics + batches + statements
 *   { dryRun: true, midOffset?, midLimit? }
 *   { confirmLive: true, midOffset?, midLimit? } — chunked writes; UI loops until done
 *
 * OpenAPI pin: partners/mspware/openapi-v2-2026-07-31.json
 *   GET /merchants/{mid}/statistics
 *   GET /merchants/{mid}/batches
 *   GET /merchants/{mid}/printstatements (probe only — no writes)
 *
 * Spec: docs/superpowers/specs/2026-07-31-msp-merchant-metrics-sync-design.md
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getPortalActor(req: Request, base44: any): Promise<{ actor: 'merchant' | 'admin'; corporateId?: string } | null> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify('HMAC', key, __b64uDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (ok) {
        const payload = JSON.parse(new TextDecoder().decode(__b64uDecode(parts[1])));
        if (payload.corporateId && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000) {
          return { actor: 'merchant', corporateId: String(payload.corporateId) };
        }
      }
    }
  } catch { /* fall through */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no session */ }
  return null;
}

const MSP_MAX_RPS = 8;
const MSP_MIN_GAP_MS = Math.ceil(1000 / MSP_MAX_RPS);
const MSP_SESSION_BUDGET = 8000;
const MSP_429_MAX_RETRIES = 4;
const BATCH_KEEP = 30;
const BATCH_DATERANGE = '6_m';
const BATCH_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_MID_LIMIT = 12;
const MID_FETCH_CAP = 2000;
const BATCH_ENTITY_FETCH_CAP = 5000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

class MspRateGate {
  mspRequestCount = 0;
  rateLimit429Count = 0;
  private lastAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(private budget = MSP_SESSION_BUDGET) {}

  private async throttle() {
    const run = async () => {
      if (this.mspRequestCount >= this.budget) {
        throw new Error(`MSP session budget exceeded (${this.budget}).`);
      }
      const wait = Math.max(0, MSP_MIN_GAP_MS - (Date.now() - this.lastAt));
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
        console.warn(`[syncMSPMerchantStats] HTTP 429 path=${label || url} attempt=${attempt + 1} total429=${this.rateLimit429Count}`);
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
    return { mspRequestCount: this.mspRequestCount, rateLimit429Count: this.rateLimit429Count };
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function parseBatchDateMs(raw: unknown): number {
  const s = String(raw || '').trim();
  if (!s) return 0;
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return ms;
  // MSP example: "August, 21 2023 00:00:00"
  const cleaned = s.replace(',', '');
  const ms2 = Date.parse(cleaned);
  return Number.isFinite(ms2) ? ms2 : 0;
}

function mapStatistics(stats: any) {
  const s = stats?.statistics && typeof stats.statistics === 'object' ? stats.statistics : stats;
  if (!s || typeof s !== 'object') return null;
  return {
    volumeCurrentMonth: numOrNull(s.volume_current_month),
    volumeLastMonth: numOrNull(s.volume_last_month),
    volumeYtd: numOrNull(s.volume_year_to_date),
    volumeQtd: numOrNull(s.volume_quarter_to_date),
    volumeTotal: numOrNull(s.volume_total),
    dateFirstDeposit: strOrNull(s.date_first_deposit),
    dateLastDeposit: strOrNull(s.date_last_deposit),
  };
}

function mapBatchRow(row: any) {
  const merchantBatchNo = strOrNull(row?.merchantbatchno ?? row?.merchantBatchNo);
  if (!merchantBatchNo) return null;
  return {
    merchantBatchNo,
    batchNum: numOrNull(row?.batchnum ?? row?.batchNum),
    dateCreated: strOrNull(row?.datecreated ?? row?.dateCreated),
    totalNetAmt: numOrNull(row?.totalnetamt ?? row?.totalNetAmt),
    amtPurchase: numOrNull(row?.amtpurchase ?? row?.amtPurchase),
    amtReturn: numOrNull(row?.amtreturn ?? row?.amtReturn),
    numPurchase: numOrNull(row?.numpurchase ?? row?.numPurchase),
    numReturn: numOrNull(row?.numreturn ?? row?.numReturn),
    averageTicket: numOrNull(row?.averageticket ?? row?.averageTicket),
    tidNum: strOrNull(row?.tidnum ?? row?.tidNum),
    applicationNo: strOrNull(row?.applicationno ?? row?.applicationNo),
    _sortMs: parseBatchDateMs(row?.datecreated ?? row?.dateCreated),
  };
}

function rollupBatches(mapped: any[]) {
  const sorted = [...mapped].sort((a, b) => (b._sortMs || 0) - (a._sortMs || 0));
  const keep = sorted.slice(0, BATCH_KEEP);
  const volume = keep.reduce((sum, b) => sum + (Number(b.totalNetAmt) || 0), 0);
  const newest = keep[0] || null;
  return {
    rows: keep.map(({ _sortMs, ...rest }) => rest),
    batchCountWindow: keep.length,
    batchVolumeWindow: volume,
    lastBatchDate: newest?.dateCreated || null,
    lastBatchNetAmt: newest?.totalNetAmt ?? null,
    lastBatchNo: newest?.merchantBatchNo || null,
  };
}

async function fetchStatistics(
  gate: MspRateGate,
  mspBase: string,
  headers: Record<string, string>,
  mid: string,
) {
  const url = `${mspBase}/merchants/${encodeURIComponent(mid)}/statistics`;
  const res = await gate.fetch(url, { method: 'GET', headers }, `/merchants/${mid}/statistics`);
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { _parseError: true, raw: text?.slice(0, 200) }; }
  return { ok: res.ok, status: res.status, data, mapped: res.ok ? mapStatistics(data) : null };
}

async function fetchBatches(
  gate: MspRateGate,
  mspBase: string,
  headers: Record<string, string>,
  mid: string,
  salesteamno: string,
) {
  const all: any[] = [];
  let page = 1;
  let pages = 1;
  let lastStatus = 0;
  let lastData: any = null;

  while (page <= pages && page <= 20) {
    const qs = new URLSearchParams({
      salesteamno: salesteamno || '',
      daterange: BATCH_DATERANGE,
      timezone: BATCH_TIMEZONE,
      page: String(page),
      pagesize: '50',
    });
    const url = `${mspBase}/merchants/${encodeURIComponent(mid)}/batches?${qs.toString()}`;
    const body = {
      salesteamno: salesteamno || '',
      daterange: BATCH_DATERANGE,
      timezone: BATCH_TIMEZONE,
      page: String(page),
      pagesize: '50',
    };
    const res = await gate.fetch(url, {
      method: 'GET',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, `/merchants/${mid}/batches`);
    lastStatus = res.status;
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { _parseError: true, raw: text?.slice(0, 200) }; }
    lastData = data;

    if (!res.ok) {
      return { ok: false, status: res.status, data, mapped: [], rollup: rollupBatches([]) };
    }

    const rows = Array.isArray(data?.data) ? data.data : [];
    all.push(...rows);
    pages = typeof data?.pages === 'number' && data.pages > 0 ? data.pages : 1;
    if (!rows.length) break;
    if (all.length >= BATCH_KEEP * 2) break; // enough to pick newest 30
    page++;
  }

  const mapped = all.map(mapBatchRow).filter(Boolean) as any[];
  return { ok: true, status: lastStatus, data: lastData, mapped, rollup: rollupBatches(mapped) };
}

async function fetchStatementsProbe(
  gate: MspRateGate,
  mspBase: string,
  headers: Record<string, string>,
  mid: string,
  salesteamno: string,
) {
  const url = `${mspBase}/merchants/${encodeURIComponent(mid)}/printstatements`;
  const body: Record<string, unknown> = {};
  if (salesteamno) body.optionalSalesteamno = Number(salesteamno) || salesteamno;
  const res = await gate.fetch(url, {
    method: 'GET',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, `/merchants/${mid}/printstatements`);
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { _parseError: true, raw: text?.slice(0, 300) }; }
  return {
    ok: res.ok,
    status: res.status,
    keys: data && typeof data === 'object' ? Object.keys(data).slice(0, 30) : [],
    success: data?.success,
    error: data?.error || null,
    sample: data,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await getPortalActor(req, base44);
    if (!actor || actor.actor !== 'admin') {
      return Response.json({ error: 'Unauthorized — MSP metrics sync is admin-only' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const probe = body.probe === true;
    const dryRun = body.dryRun === true;
    const confirmLive = body.confirmLive === true;

    if (!probe && !dryRun && !confirmLive) {
      return Response.json({
        error: 'Specify probe: true, dryRun: true, or confirmLive: true',
      }, { status: 400 });
    }
    if (confirmLive && dryRun) {
      return Response.json({ error: 'confirmLive and dryRun are mutually exclusive' }, { status: 400 });
    }

    const apiKey = Deno.env.get('MSP_APP_KEY');
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const salesteamno = String(Deno.env.get('MSP_SALESTEAM_NO') || '').trim();

    if (!apiKey) {
      return Response.json({ error: 'MSP_APP_KEY not configured' }, { status: 503 });
    }

    const headers = {
      'X-API-KEY': apiKey,
      'X-App-ID': appId,
      Accept: 'application/json',
    };
    const gate = new MspRateGate();

    const allMids = await base44.asServiceRole.entities.MerchantMID.list('-updated_date', MID_FETCH_CAP);
    const eligible = (allMids || []).filter((m: any) => String(m.elavonMID || '').trim());
    eligible.sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)));

    // ── probe ───────────────────────────────────────────────────────────────
    if (probe) {
      const sampleSize = Math.min(8, Math.max(1, Number(body.sampleSize) || 3));
      const sample = eligible.slice(0, sampleSize);
      const results: any[] = [];
      for (const midRow of sample) {
        const mid = String(midRow.elavonMID).trim();
        const stats = await fetchStatistics(gate, mspBase, headers, mid);
        const batches = await fetchBatches(gate, mspBase, headers, mid, salesteamno);
        const statements = await fetchStatementsProbe(gate, mspBase, headers, mid, salesteamno);
        results.push({
          merchantMidId: midRow.id,
          elavonMID: mid,
          dbaName: midRow.dbaName || midRow.merchantName || null,
          statistics: {
            ok: stats.ok,
            status: stats.status,
            mapped: stats.mapped,
            error: stats.ok ? null : (stats.data?.error || `HTTP ${stats.status}`),
          },
          batches: {
            ok: batches.ok,
            status: batches.status,
            rowCount: batches.mapped.length,
            rollup: batches.rollup,
            error: batches.ok ? null : (batches.data?.error || `HTTP ${batches.status}`),
            sampleRows: batches.mapped.slice(0, 3),
          },
          statements: {
            ok: statements.ok,
            status: statements.status,
            keys: statements.keys,
            success: statements.success,
            error: statements.error,
            note: 'Probe only — statements are not written by this sync',
          },
        });
      }

      return Response.json({
        success: true,
        probe: true,
        salesteamnoConfigured: Boolean(salesteamno),
        eligibleCount: eligible.length,
        sampleSize: sample.length,
        results,
        rateLimit: gate.stats(),
        truncated: (allMids || []).length >= MID_FETCH_CAP,
      });
    }

    // ── dry run / live ──────────────────────────────────────────────────────
    const midOffset = Math.max(0, Number(body.midOffset) || 0);
    const midLimit = Math.min(40, Math.max(1, Number(body.midLimit) || DEFAULT_MID_LIMIT));
    const slice = eligible.slice(midOffset, midOffset + midLimit);
    const nextMidOffset = midOffset + slice.length;
    const done = nextMidOffset >= eligible.length;

    const summary = {
      eligibleCount: eligible.length,
      midsProcessed: 0,
      statsOk: 0,
      statsFail: 0,
      batchesOk: 0,
      batchesFail: 0,
      batchRowsUpserted: 0,
      batchRowsDeleted: 0,
      writeErrors: 0,
      writeErrorDetails: [] as string[],
      rateLimit429Count: 0,
      mspRequestCount: 0,
    };

    const entities: any[] = [];
    const nowIso = new Date().toISOString();

    for (const midRow of slice) {
      const mid = String(midRow.elavonMID).trim();
      summary.midsProcessed++;
      const entry: any = {
        merchantMidId: midRow.id,
        elavonMID: mid,
        dbaName: midRow.dbaName || midRow.merchantName || null,
        corporateId: midRow.corporateId || null,
        result: 'ok',
      };

      try {
        const stats = await fetchStatistics(gate, mspBase, headers, mid);
        const batches = await fetchBatches(gate, mspBase, headers, mid, salesteamno);

        entry.statistics = {
          ok: stats.ok,
          status: stats.status,
          mapped: stats.mapped,
          error: stats.ok ? null : (stats.data?.error || `HTTP ${stats.status}`),
        };
        entry.batches = {
          ok: batches.ok,
          status: batches.status,
          keepCount: batches.rollup.batchCountWindow,
          batchVolumeWindow: batches.rollup.batchVolumeWindow,
          lastBatchDate: batches.rollup.lastBatchDate,
          error: batches.ok ? null : (batches.data?.error || `HTTP ${batches.status}`),
        };

        if (stats.ok) summary.statsOk++;
        else summary.statsFail++;
        if (batches.ok) summary.batchesOk++;
        else summary.batchesFail++;

        if (!dryRun && confirmLive) {
          const midUpdate: Record<string, unknown> = {};
          if (stats.ok && stats.mapped) {
            Object.assign(midUpdate, stats.mapped);
            midUpdate.mspStatsSyncedAt = nowIso;
            midUpdate.mspStatsError = null;
          } else {
            midUpdate.mspStatsError = entry.statistics.error || 'statistics failed';
          }

          if (batches.ok) {
            midUpdate.batchCountWindow = batches.rollup.batchCountWindow;
            midUpdate.batchVolumeWindow = batches.rollup.batchVolumeWindow;
            midUpdate.lastBatchDate = batches.rollup.lastBatchDate;
            midUpdate.lastBatchNetAmt = batches.rollup.lastBatchNetAmt;
            midUpdate.lastBatchNo = batches.rollup.lastBatchNo;
            midUpdate.mspBatchesSyncedAt = nowIso;
            midUpdate.mspBatchesError = null;

            // Upsert batch rows
            let existing: any[] = [];
            try {
              const allBatches = await base44.asServiceRole.entities.MerchantMidBatch.list(
                '-updated_date',
                BATCH_ENTITY_FETCH_CAP,
              );
              existing = (allBatches || []).filter(
                (b: any) => String(b.merchantMidId || '') === String(midRow.id),
              );
            } catch (entErr: any) {
              const msg = String(entErr?.message || entErr || '');
              if (/not found|unknown|schema|MerchantMidBatch/i.test(msg)) {
                throw new Error(
                  'MerchantMidBatch entity missing — publish base44/entities/MerchantMidBatch.jsonc in Base44, then retry',
                );
              }
              throw entErr;
            }

            const byNo = new Map(existing.map((b: any) => [String(b.merchantBatchNo), b]));
            for (const row of batches.rollup.rows) {
              const payload = {
                merchantMidId: midRow.id,
                elavonMID: mid,
                corporateId: midRow.corporateId || null,
                merchantBatchNo: row.merchantBatchNo,
                batchNum: row.batchNum,
                dateCreated: row.dateCreated,
                totalNetAmt: row.totalNetAmt,
                amtPurchase: row.amtPurchase,
                amtReturn: row.amtReturn,
                numPurchase: row.numPurchase,
                numReturn: row.numReturn,
                averageTicket: row.averageTicket,
                tidNum: row.tidNum,
                applicationNo: row.applicationNo,
                syncedAt: nowIso,
              };
              const prev = byNo.get(String(row.merchantBatchNo));
              if (prev?.id) {
                await base44.asServiceRole.entities.MerchantMidBatch.update(prev.id, payload);
              } else {
                await base44.asServiceRole.entities.MerchantMidBatch.create(payload);
              }
              summary.batchRowsUpserted++;
            }

            const keepNos = new Set(batches.rollup.rows.map((r: any) => String(r.merchantBatchNo)));
            // Refresh list after upserts
            const refreshed = await base44.asServiceRole.entities.MerchantMidBatch.list(
              '-updated_date',
              BATCH_ENTITY_FETCH_CAP,
            );
            const forMid = (refreshed || []).filter(
              (b: any) => String(b.merchantMidId || '') === String(midRow.id),
            );
            // Sort by date; delete beyond 30 or not in this window keep set if we have 30
            const sortedExisting = [...forMid].sort(
              (a, b) => parseBatchDateMs(b.dateCreated) - parseBatchDateMs(a.dateCreated),
            );
            for (let i = 0; i < sortedExisting.length; i++) {
              const row = sortedExisting[i];
              const tooOld = i >= BATCH_KEEP;
              const notInWindow = batches.rollup.rows.length >= BATCH_KEEP
                && !keepNos.has(String(row.merchantBatchNo));
              if (tooOld || notInWindow) {
                try {
                  await base44.asServiceRole.entities.MerchantMidBatch.delete(row.id);
                  summary.batchRowsDeleted++;
                } catch (delErr: any) {
                  console.warn('[syncMSPMerchantStats] batch delete', delErr?.message || delErr);
                }
              }
            }
          } else {
            midUpdate.mspBatchesError = entry.batches.error || 'batches failed';
          }

          await base44.asServiceRole.entities.MerchantMID.update(midRow.id, midUpdate);
        }
      } catch (err: any) {
        summary.writeErrors++;
        const msg = `${mid}: ${err?.message || err}`;
        summary.writeErrorDetails.push(msg);
        entry.result = 'error';
        entry.error = err?.message || String(err);
        console.error('[syncMSPMerchantStats] mid', mid, err);
      }

      entities.push(entry);
    }

    const rate = gate.stats();
    summary.rateLimit429Count = rate.rateLimit429Count;
    summary.mspRequestCount = rate.mspRequestCount;

    return Response.json({
      success: true,
      dryRun: !!dryRun,
      confirmLive: !!confirmLive,
      salesteamnoConfigured: Boolean(salesteamno),
      midOffset,
      midLimit,
      midsTotal: eligible.length,
      midsProcessed: slice.length,
      nextMidOffset,
      done,
      summary,
      entities,
      rateLimit: rate,
      truncated: (allMids || []).length >= MID_FETCH_CAP,
    });
  } catch (err: any) {
    console.error('[syncMSPMerchantStats]', err);
    return Response.json({
      error: err?.message || 'Internal error',
      stack: String(err?.stack || '').split('\n').slice(0, 4).join(' | '),
    }, { status: 500 });
  }
});
