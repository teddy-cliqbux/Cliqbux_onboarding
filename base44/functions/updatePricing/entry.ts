import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// updatePricing — admin / impersonation-only pricing editor write path.
// Canonical store: MerchantCorporateProfile (MSP fill already reads these fields).
// Optional mirror: latest admin StagedApplication.prefilledData.pricing.
// After save, re-fills existing MSPWare drafts via submitToMSP (non-fatal).
//
// POST /functions/updatePricing
// Body:
//   { corporateId, pricingType?: 'template'|'custom', pricingTier?,
//     customMarkupPercentage?, customPerTxFee?, customAuthPerCard? }
//   OR { action: 'get', corporateId }
//
// Auth: admin workspace session, OR merchant JWT with imp:true matching corporateId.
// Plain merchants are rejected (401).

function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getPortalActor(req: Request, base44: any): Promise<{ actor: 'merchant' | 'admin'; corporateId?: string; imp?: boolean } | null> {
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

const ALLOWED_TIERS = new Set([
  'CUSTOM_INTERCHANGE_PLUS',
  'CUSTOM_FLAT_RATE',
  'SELF_SERVE_CASH_DISCOUNT',
]);

const LOCKED_MID = new Set(['Pending MID', 'Active', 'Active (Existing)']);

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pricingSnapshot(profile: any) {
  return {
    pricingType: profile?.pricingType === 'custom' ? 'custom' : 'template',
    pricingTier: profile?.pricingTier || null,
    customMarkupPercentage: profile?.customMarkupPercentage ?? null,
    customPerTxFee: profile?.customPerTxFee ?? null,
    customAuthPerCard: profile?.customAuthPerCard ?? null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const corporateId = body.corporateId != null ? String(body.corporateId).trim() : '';
    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });

    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Admin always OK. Merchant only when impersonating this corporateId.
    if (actor.actor === 'merchant') {
      if (!actor.imp || actor.corporateId !== corporateId) {
        return Response.json({ error: 'Unauthorized — pricing edits require admin or impersonation' }, { status: 401 });
      }
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
      { corporateId }, '-created_date', 1
    );
    if (!profiles?.length) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    if (body.action === 'get') {
      return Response.json({ success: true, corporateId, pricing: pricingSnapshot(profile) });
    }

    const pricingType = body.pricingType === 'custom' ? 'custom' : 'template';
    let pricingTier = body.pricingTier != null
      ? String(body.pricingTier).trim().toUpperCase()
      : String(profile.pricingTier || '').toUpperCase();

    if (pricingTier && !ALLOWED_TIERS.has(pricingTier)) {
      return Response.json({
        error: `Invalid pricingTier "${pricingTier}". Allowed: ${[...ALLOWED_TIERS].join(', ')}`,
      }, { status: 400 });
    }
    if (!pricingTier) pricingTier = 'CUSTOM_INTERCHANGE_PLUS';

    const patch: Record<string, any> = {
      pricingType,
      pricingTier,
    };

    // Cash Discount uses the fixed TIERD schedule — ignore custom fee overrides.
    if (pricingTier === 'SELF_SERVE_CASH_DISCOUNT') {
      // Leave existing custom* fields alone (harmless); MSP fill ignores them for CD.
    } else {
      const markup = numOrNull(body.customMarkupPercentage);
      const perTx = numOrNull(body.customPerTxFee);
      const auth = numOrNull(body.customAuthPerCard);

      if (markup != null) {
        if (markup < 0 || markup > 100) {
          return Response.json({ error: 'customMarkupPercentage must be 0–100 (percent, e.g. 0.15 for 0.15%)' }, { status: 400 });
        }
        patch.customMarkupPercentage = markup;
      }
      if (perTx != null) {
        if (perTx < 0 || perTx > 100) {
          return Response.json({ error: 'customPerTxFee must be a non-negative dollar amount' }, { status: 400 });
        }
        patch.customPerTxFee = perTx;
      }
      if (auth != null) {
        if (auth < 0 || auth > 100) {
          return Response.json({ error: 'customAuthPerCard must be a non-negative dollar amount' }, { status: 400 });
        }
        patch.customAuthPerCard = auth;
      }

      // Custom / ICPLS / Flat always need all three for boarding — warn but still save partials
      // so agents can stage values mid-negotiation. Hard block only when explicitly forceComplete.
      if (body.forceComplete === true) {
        const nextMarkup = patch.customMarkupPercentage ?? profile.customMarkupPercentage;
        const nextPerTx = patch.customPerTxFee ?? profile.customPerTxFee;
        const nextAuth = patch.customAuthPerCard ?? profile.customAuthPerCard;
        if (nextMarkup == null || nextPerTx == null || nextAuth == null) {
          return Response.json({
            error: 'Markup %, per-transaction fee, and auth fee are all required before completing custom pricing.',
          }, { status: 400 });
        }
      }
    }

    const updated = await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, patch);

    // Mirror onto latest admin staged app (not __auto_track__) for drawer reopen.
    try {
      const stages = await base44.asServiceRole.entities.StagedApplication.filter(
        { corporateId }, '-updated_date', 20
      );
      const adminStage = (stages || []).find((s: any) => s.label !== '__auto_track__');
      if (adminStage?.id) {
        const prev = (adminStage.prefilledData && typeof adminStage.prefilledData === 'object')
          ? adminStage.prefilledData
          : {};
        await base44.asServiceRole.entities.StagedApplication.update(adminStage.id, {
          prefilledData: {
            ...prev,
            pricing: pricingSnapshot(updated),
          },
        });
      }
    } catch (e: any) {
      console.warn('[updatePricing] stage mirror failed (non-fatal):', e.message);
    }

    // Background re-fill existing drafts (never submit to Elavon from this path).
    let refill: any = { queued: false, midCount: 0 };
    try {
      const mids = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId }) || [];
      const refillable = mids.filter((m: any) =>
        m.mspApplicationNo && !LOCKED_MID.has(m.applicationStepStatus)
      );
      if (refillable.length > 0) {
        refill = { queued: true, midCount: refillable.length, midIds: refillable.map((m: any) => m.id) };
        // Fire-and-forget — do not block the agent UI on MSPWare latency.
        base44.functions.invoke('submitToMSP', {
          corporateId,
          midIds: refillable.map((m: any) => m.id),
        }).catch((e: any) => console.warn('[updatePricing] submitToMSP refill failed:', e.message));
      }
    } catch (e: any) {
      console.warn('[updatePricing] refill discovery failed:', e.message);
    }

    return Response.json({
      success: true,
      corporateId,
      pricing: pricingSnapshot(updated),
      profile: updated,
      refill,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
