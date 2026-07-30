/**
 * manageMerchantAccount — admin-only Merchant Account portfolio hub.
 *
 * Actions:
 *   list              — paginated accounts + derived status + counts; q + status filter
 *   get               — one account + deals + locations + MIDs
 *   listUnlinkedDeals — profiles with no merchantAccountId
 *
 * corporateId on profiles = HubSpot Deal ID — never use as account primary key.
 * Never expose to merchant portal tokens.
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

function parseEntities(raw: unknown): any[] {
  let v: any = raw ?? [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = []; }
  }
  return Array.isArray(v) ? v : [];
}

// --- BEGIN merchantAccountStatus (sync with src/lib/merchantAccountStatus.js) ---
const LIVE_MID_STATUSES = new Set(['Active', 'Active (Existing)']);
const PENDING_MID_STATUSES = new Set(['Pending MID']);
const ONBOARDING_APP_STATUSES = new Set(['Incomplete', 'Quote Signed', 'Submitted']);

function isLiveMid(mid: any): boolean {
  return LIVE_MID_STATUSES.has(String(mid?.applicationStepStatus || ''));
}
function midNeedsAttention(mid: any): boolean {
  if (!mid) return false;
  if (String(mid.applicationStepStatus || '') === 'Error') return true;
  if (mid.mccHelpRequested === true) return true;
  return false;
}
function countMids(mids: any[] = []) {
  const list = Array.isArray(mids) ? mids : [];
  let live = 0, pending = 0, error = 0, other = 0;
  for (const m of list) {
    const st = String(m?.applicationStepStatus || '');
    if (LIVE_MID_STATUSES.has(st)) live += 1;
    else if (PENDING_MID_STATUSES.has(st)) pending += 1;
    else if (st === 'Error') error += 1;
    else other += 1;
  }
  return { total: list.length, live, pending, error, other };
}
function isOnboardingDeal(deal: any): boolean {
  if (!deal) return false;
  const app = String(deal.applicationStatus || 'Incomplete');
  if (ONBOARDING_APP_STATUSES.has(app)) return true;
  const handoff = String(deal.handoffStage || '').toLowerCase();
  if (handoff && handoff !== 'support') return true;
  return false;
}
function deriveAccountStatus({ deals = [], mids = [] }: { deals?: any[]; mids?: any[] }): string {
  const dealList = Array.isArray(deals) ? deals : [];
  const midList = Array.isArray(mids) ? mids : [];
  if (midList.some(midNeedsAttention)) return 'needs_attention';
  if (midList.some(isLiveMid)) return 'live';
  if (dealList.some(isOnboardingDeal)) return 'onboarding';
  return 'prospect';
}
function latestDealActivity(deals: any[] = []): string | null {
  let best: string | null = null;
  let bestMs = 0;
  for (const d of Array.isArray(deals) ? deals : []) {
    const raw = d?.updated_date || d?.updatedAt || d?.created_date || null;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = String(raw);
    }
  }
  return best;
}
// --- END merchantAccountStatus ---

const PAGE_SIZE_DEFAULT = 50;
const ACCOUNT_FETCH_CAP = 300;
const PROFILE_FETCH_CAP = 500;
const MID_FETCH_CAP = 1000;
const LOCATION_FETCH_CAP = 500;

function dealMatchesQuery(deal: any, q: string): boolean {
  if (!q) return true;
  const hay = [
    deal?.legalName,
    deal?.dbaName,
    deal?.corporateId,
  ].map((x) => String(x || '').toLowerCase()).join(' ');
  return hay.includes(q);
}

function accountMatchesQuery(account: any, deals: any[], q: string): boolean {
  if (!q) return true;
  const hay = [
    account?.name,
    account?.domain,
    account?.hubspotCompanyId,
    account?.id,
  ].map((x) => String(x || '').toLowerCase()).join(' ');
  if (hay.includes(q)) return true;
  return deals.some((d) => dealMatchesQuery(d, q));
}

function summarizeDeal(deal: any) {
  return {
    id: deal.id,
    corporateId: String(deal.corporateId || ''),
    legalName: deal.legalName || null,
    dbaName: deal.dbaName || null,
    applicationStatus: deal.applicationStatus || null,
    portalLockStatus: deal.portalLockStatus || null,
    handoffStage: deal.handoffStage || null,
    pricingTier: deal.pricingTier || null,
    updated_date: deal.updated_date || deal.updatedAt || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await getPortalActor(req, base44);
    if (!actor || actor.actor !== 'admin') {
      return Response.json({ error: 'Unauthorized — Merchant Account hub is admin-only' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list').trim();

    // ── listUnlinkedDeals ───────────────────────────────────────────────────
    if (action === 'listUnlinkedDeals') {
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.list(
        '-updated_date',
        PROFILE_FETCH_CAP,
      );
      const unlinked = (profiles || []).filter((p: any) => !p.merchantAccountId);
      const deals = unlinked.map((p: any) => ({
        ...summarizeDeal(p),
        merchantAccountId: null,
      }));
      return Response.json({ deals, truncated: (profiles || []).length >= PROFILE_FETCH_CAP });
    }

    // ── get ─────────────────────────────────────────────────────────────────
    if (action === 'get') {
      const merchantAccountId = String(body.merchantAccountId || body.id || '').trim();
      if (!merchantAccountId) {
        return Response.json({ error: 'merchantAccountId required' }, { status: 400 });
      }

      let account: any = null;
      try {
        account = await base44.asServiceRole.entities.MerchantAccount.get(merchantAccountId);
      } catch {
        account = null;
      }
      if (!account) {
        return Response.json({ error: 'Merchant account not found' }, { status: 404 });
      }

      const [allProfiles, allLocations, allMids] = await Promise.all([
        base44.asServiceRole.entities.MerchantCorporateProfile.list('-updated_date', PROFILE_FETCH_CAP),
        base44.asServiceRole.entities.MerchantLocations.list('-updated_date', LOCATION_FETCH_CAP),
        base44.asServiceRole.entities.MerchantMID.list('-updated_date', MID_FETCH_CAP),
      ]);

      const deals = (allProfiles || []).filter(
        (p: any) => String(p.merchantAccountId || '') === merchantAccountId,
      );
      const dealIds = new Set(deals.map((d: any) => String(d.corporateId || '')).filter(Boolean));
      const locations = (allLocations || []).filter((l: any) => dealIds.has(String(l.corporateId || '')));
      const mids = (allMids || []).filter((m: any) => dealIds.has(String(m.corporateId || '')));
      const midCounts = countMids(mids);
      const status = deriveAccountStatus({ deals, mids });

      const locationById = new Map(locations.map((l: any) => [String(l.id), l]));
      const midsByLocation = mids.map((m: any) => {
        const loc = locationById.get(String(m.locationId || ''));
        return {
          id: m.id,
          corporateId: String(m.corporateId || ''),
          locationId: m.locationId || null,
          locationName: loc?.dbaName || loc?.businessName || null,
          dbaName: m.dbaName || m.merchantName || null,
          applicationStepStatus: m.applicationStepStatus || null,
          elavonMID: m.elavonMID || null,
          mccCode: m.mccCode || null,
          mccHelpRequested: !!m.mccHelpRequested,
          mspApplicationNo: m.mspApplicationNo || null,
        };
      });

      return Response.json({
        account: {
          id: account.id,
          name: account.name,
          domain: account.domain || null,
          hubspotCompanyId: account.hubspotCompanyId || null,
          legalEntities: parseEntities(account.legalEntities),
        },
        status,
        midCounts,
        dealCount: deals.length,
        locationCount: locations.length,
        lastActivity: latestDealActivity(deals),
        deals: deals.map(summarizeDeal),
        locations: locations.map((l: any) => ({
          id: l.id,
          corporateId: String(l.corporateId || ''),
          dbaName: l.dbaName || null,
          businessAddress: l.businessAddress || null,
          businessCity: l.businessCity || null,
          businessState: l.businessState || null,
        })),
        mids: midsByLocation,
      });
    }

    // ── list ────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const q = String(body.q || '').trim().toLowerCase();
      const statusFilter = String(body.status || '').trim().toLowerCase();
      const page = Math.max(1, Number(body.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(body.pageSize) || PAGE_SIZE_DEFAULT));

      const [accounts, allProfiles, allMids] = await Promise.all([
        base44.asServiceRole.entities.MerchantAccount.list('-updated_date', ACCOUNT_FETCH_CAP),
        base44.asServiceRole.entities.MerchantCorporateProfile.list('-updated_date', PROFILE_FETCH_CAP),
        base44.asServiceRole.entities.MerchantMID.list('-updated_date', MID_FETCH_CAP),
      ]);

      const profilesByAccount = new Map<string, any[]>();
      for (const p of allProfiles || []) {
        const aid = String(p.merchantAccountId || '');
        if (!aid) continue;
        if (!profilesByAccount.has(aid)) profilesByAccount.set(aid, []);
        profilesByAccount.get(aid)!.push(p);
      }

      const midsByDeal = new Map<string, any[]>();
      for (const m of allMids || []) {
        const cid = String(m.corporateId || '');
        if (!cid) continue;
        if (!midsByDeal.has(cid)) midsByDeal.set(cid, []);
        midsByDeal.get(cid)!.push(m);
      }

      const locationIds = new Set<string>();
      for (const m of allMids || []) {
        if (m.locationId) locationIds.add(String(m.locationId));
      }

      let rows = (accounts || []).map((account: any) => {
        const deals = profilesByAccount.get(String(account.id)) || [];
        const mids: any[] = [];
        for (const d of deals) {
          const cid = String(d.corporateId || '');
          if (cid && midsByDeal.has(cid)) mids.push(...midsByDeal.get(cid)!);
        }
        const locSet = new Set<string>();
        for (const m of mids) {
          if (m.locationId) locSet.add(String(m.locationId));
        }
        const midCounts = countMids(mids);
        const status = deriveAccountStatus({ deals, mids });
        return {
          id: account.id,
          name: account.name || 'Untitled account',
          domain: account.domain || null,
          hubspotCompanyId: account.hubspotCompanyId || null,
          status,
          dealCount: deals.length,
          locationCount: locSet.size,
          midCounts,
          lastActivity: latestDealActivity(deals),
          _deals: deals,
        };
      });

      if (q) {
        rows = rows.filter((r: any) => accountMatchesQuery(r, r._deals, q));
      }
      if (statusFilter && statusFilter !== 'all') {
        rows = rows.filter((r: any) => r.status === statusFilter);
      }

      // Prefer recently active accounts
      rows.sort((a: any, b: any) => {
        const am = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const bm = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return bm - am;
      });

      const total = rows.length;
      const start = (page - 1) * pageSize;
      const pageRows = rows.slice(start, start + pageSize).map((r: any) => {
        const { _deals, ...rest } = r;
        return rest;
      });

      return Response.json({
        accounts: pageRows,
        page,
        pageSize,
        total,
        truncated:
          (accounts || []).length >= ACCOUNT_FETCH_CAP
          || (allProfiles || []).length >= PROFILE_FETCH_CAP
          || (allMids || []).length >= MID_FETCH_CAP,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('[manageMerchantAccount]', err);
    return Response.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
});
