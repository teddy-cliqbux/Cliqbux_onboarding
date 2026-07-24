import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── prepareMSPForms ──────────────────────────────────────────────────────────
// Fill/refill MSPWare drafts only. Never creates BoldSign packages and never
// sets portalLockStatus=signing.
//
// Flow: submitToMSP (draft + PUT /form) → GET /form per MID → report %.
// Merchants: require all AML KYC verified. Agents (workspace / imp JWT): anytime.
//
// POST /functions/prepareMSPForms
// Body: { corporateId, midIds?: string[] }

function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

type PortalActor = {
  actor: 'merchant' | 'admin';
  corporateId?: string;
  imp?: boolean;
};

async function getPortalActor(req: Request, base44: any): Promise<PortalActor | null> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const ok = await crypto.subtle.verify(
        'HMAC',
        key,
        __b64uDecode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
      if (ok) {
        const payload = JSON.parse(new TextDecoder().decode(__b64uDecode(parts[1])));
        if (payload.corporateId && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000) {
          return {
            actor: 'merchant',
            corporateId: String(payload.corporateId),
            imp: payload.imp === true,
          };
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

function flattenFormErrors(formData: any): string[] {
  const vErr = formData?.validation?.errors || {};
  const nested = [
    ...(Array.isArray(vErr.data) ? vErr.data : []),
    ...(Array.isArray(vErr.fields) ? vErr.fields : []),
    ...(Array.isArray(vErr.general) ? vErr.general : []),
  ].map((e: any) => {
    if (typeof e === 'string') return e;
    if (e?.message) return String(e.message);
    if (e?.field && e?.error) return `${e.field}: ${e.error}`;
    try { return JSON.stringify(e); } catch { return String(e); }
  });
  return [
    ...(formData?.completion_errors || []).map(String),
    ...nested,
  ].filter(Boolean);
}

function isFormReady(formData: any): boolean {
  const pct = Number(formData?.percent_complete ?? formData?.percentComplete ?? NaN);
  const errors = flattenFormErrors(formData);
  // canSave:false at 100% is OK (MSPWare quirk — do not treat as incomplete)
  return Number.isFinite(pct) && pct >= 100 && errors.length === 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const corporateId = String(body.corporateId || '').trim();
    const midIds = Array.isArray(body.midIds) ? body.midIds.map(String) : null;

    if (!corporateId) {
      return Response.json({ error: 'corporateId required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== corporateId)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isAgent = actor.actor === 'admin' || !!actor.imp;

    const [profiles, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }, '-created_date', 1),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);
    const profile = profiles?.[0];
    if (!profile) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }

    // Merchants may Prepare only after KYC; agents anytime
    if (!isAgent) {
      const isPortalAdminFn = (s: any) => s?.isPortalAdmin === true;
      const isControlFn = (s: any) => {
        if (!s || isPortalAdminFn(s)) return false;
        if (s.isAuthorizedSigner === true) return true;
        if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
        return false;
      };
      const isBoFn = (s: any) => {
        if (!s || isPortalAdminFn(s)) return false;
        if (s.isBeneficialOwner === true) return true;
        return (Number(s.ownershipPercentage) || 0) >= 25;
      };
      const isAmlFn = (s: any) => !isPortalAdminFn(s) && (isControlFn(s) || isBoFn(s));
      const isVerifiedPlus = (st: any) => {
        const s = String(st || '').toLowerCase();
        return s === 'verified' || s === 'application signed' || s === 'signed';
      };
      const amlPrincipals = (signers || []).filter(isAmlFn);
      const kycIncomplete = amlPrincipals.filter((s: any) => !isVerifiedPlus(s?.identityStatus));
      if (kycIncomplete.length > 0) {
        const names = kycIncomplete.map((s: any) =>
          `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.signerEmail || 'owner'
        );
        return Response.json({
          success: false,
          error: `Finish identity verification before preparing the form. Still waiting on: ${names.join(', ')}.`,
          code: 'KYC_INCOMPLETE',
          kycIncomplete: names,
          allReady: false,
          mids: [],
        }, { status: 422 });
      }
    }

    // Refuse prepare while locked for signing — unlock first
    const lock = String(profile.portalLockStatus || '').toLowerCase();
    if (['signing', 'pending_signature', 'all_signed'].includes(lock)
      || profile.applicationStatus === 'Submitted') {
      return Response.json({
        success: false,
        error: 'Forms are locked for signing. Unlock & Modify Details before preparing the form again.',
        code: 'FORMS_LOCKED',
        allReady: false,
        mids: [],
      }, { status: 423 });
    }

    // Create/fill drafts via submitToMSP (never submits to Elavon unless env gate)
    let submitResult: any = null;
    try {
      const submitPayload: Record<string, any> = { corporateId };
      if (midIds?.length) submitPayload.midIds = midIds;
      const inv = await base44.functions.invoke('submitToMSP', submitPayload);
      submitResult = inv?.data ?? inv;
    } catch (e: any) {
      return Response.json({
        success: false,
        error: e?.message || 'submitToMSP failed',
        code: 'PREPARE_FILL_FAILED',
        allReady: false,
        mids: [],
      }, { status: 502 });
    }

    if (submitResult?.error && !submitResult?.results) {
      return Response.json({
        success: false,
        error: submitResult.error,
        code: submitResult.code || 'PREPARE_FILL_FAILED',
        submitResult,
        allReady: false,
        mids: [],
      }, { status: 422 });
    }

    // Re-load MIDs after fill (mspApplicationNo may be new)
    let mids = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId }) || [];
    const DONE = ['Pending MID', 'Active', 'Active (Existing)'];
    mids = mids.filter((m: any) => !DONE.includes(m.applicationStepStatus));
    if (midIds?.length) {
      const want = new Set(midIds.map(String));
      mids = mids.filter((m: any) => want.has(String(m.id)));
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    if (!apiKey) {
      return Response.json({ error: 'MSP_APP_KEY not set' }, { status: 500 });
    }
    const headers = {
      'X-API-KEY': apiKey,
      'X-App-ID': appId,
      Accept: 'application/json',
    };

    const midReports: any[] = [];
    for (const mid of mids) {
      const appNo = mid.mspApplicationNo ? String(mid.mspApplicationNo) : null;
      const row: Record<string, any> = {
        midId: mid.id,
        dbaName: mid.dbaName || mid.merchantName,
        mspApplicationNo: appNo,
        percentComplete: null,
        ready: false,
        errors: [] as string[],
      };

      if (!appNo) {
        row.errors = ['No MSPWare draft — fill may have failed (check MCC, pricing, and location data).'];
        // Attach submitToMSP row hint if present
        const sr = (submitResult?.results || []).find((r: any) => String(r.midId) === String(mid.id));
        if (sr?.error) row.errors.push(String(sr.error));
        midReports.push(row);
        continue;
      }

      try {
        const formRes = await fetch(`${mspBase}/applications/${appNo}/form`, { headers });
        const formData = await formRes.json().catch(() => ({}));
        if (!formRes.ok) {
          row.errors = [`GET /form HTTP ${formRes.status}`];
        } else {
          const pct = Number(formData?.percent_complete ?? formData?.percentComplete ?? NaN);
          row.percentComplete = Number.isFinite(pct) ? pct : null;
          row.errors = flattenFormErrors(formData);
          row.ready = isFormReady(formData);
          row.canSave = formData?.canSave;
        }
      } catch (e: any) {
        row.errors = [e?.message || 'Failed to read MSPWare form'];
      }
      midReports.push(row);
    }

    const signable = midReports.filter((r) => r.mspApplicationNo || r.errors?.length);
    const allReady = signable.length > 0 && midReports.every((r) => r.ready);
    const anyReady = midReports.some((r) => r.ready);

    return Response.json({
      success: true,
      corporateId,
      allReady,
      anyReady,
      portalLockStatus: profile.portalLockStatus || 'unlocked',
      // Never lock from Prepare
      hasUsableSigningPackage: false,
      mids: midReports,
      submitResult: {
        success: submitResult?.success,
        results: submitResult?.results,
      },
      message: allReady
        ? 'All forms are 100% complete. You can Sign the merchant agreement.'
        : 'Form prepare finished. Fix the listed fields, then Prepare again until every MID is 100%.',
    });
  } catch (error: any) {
    console.error('[prepareMSPForms]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
