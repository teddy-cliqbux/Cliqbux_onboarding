import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
// getPortalActor returns { actor: 'merchant', corporateId } when the request
// carries a valid merchant JWT (issued by validateResumeToken, createHubspotDeal,
// or manageStagedApplication 'validate'), { actor: 'admin' } when it carries a
// Base44 workspace session, or null when neither. Callers must 401 on null and
// enforce corporateId match for merchant actors.
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
  } catch { /* invalid merchant token — fall through to workspace check */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no workspace session */ }
  return null;
}


// Maps the merchant's chosen pricingTier to the correct MSPWare pricing_method.
// MerchantMID.pricingMethod has a schema-level default of 'ICPLS', which will
// silently mask this derivation if the field is left unset at create time —
// always set it explicitly here rather than relying on the schema default.
// 2026-07-06: added the 3 canonical simplified tier names (see AGENTS.md Critical
// Lesson #12). Legacy values kept mapped for historical/in-flight records.
const TIER_TO_METHOD: Record<string, string> = {
  'CUSTOM_FLAT_RATE': 'FLAT',
  'CUSTOM_INTERCHANGE_PLUS': 'ICPLS',
  'SELF_SERVE_CASH_DISCOUNT': 'TIERD',
  'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS',
  'SELF_SWIPED': 'ICPLS', 'SELF_KEYED': 'ICPLS', // ON HOLD — see Critical Lesson #12
  // 2026-07-03: Teddy confirmed Cliqbux never uses MSPWare's "Clear and Simple"
  // pricing method — every Cash Discount plan uses "Tiered" (wire value TIERD)
  // instead, with a flat-rate fee schedule sent explicitly in buildFormPayload
  // (see submitToMSP/signApplication + docs/mspware-field-reference.md).
  'CASH_DISCOUNT': 'TIERD', 'SELF_CASH_DISCOUNT': 'TIERD',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, corporateId, locationId, merchantIDId, data } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // — LIST —
    if (action === 'list') {
      const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId });
      return Response.json({ merchantIDs: merchantMIDs || [] });
    }

    // — ADD —
    if (action === 'add') {
      if (!locationId) return Response.json({ error: 'locationId is required' }, { status: 400 });

      // Derive pricingMethod from the merchant's chosen pricingTier — must be set
      // explicitly, since MerchantMID.pricingMethod's schema default ('ICPLS')
      // would otherwise silently override a Cash Discount merchant's real method.
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const profile = profiles?.[0];
      const pricingMethod = data?.pricingMethod || TIER_TO_METHOD[(profile?.pricingTier || '').toUpperCase()] || 'ICPLS';

      const merchantMIDData = {
        locationId,
        corporateId,
        merchantName: data?.merchantName || locationId,
        dbaName: data?.merchantName || data?.dbaName || '',
        mccCode: data?.mccCode || '',
        industryType: data?.industryType || '',
        pricingMethod,
        monthlyCardSales: data?.monthlyCardSales ? Number(data.monthlyCardSales) : 0,
        avgSaleAmount: data?.avgSaleAmount ? Number(data.avgSaleAmount) : 0,
        highestTicketAmount: data?.highestTicketAmount ? Number(data.highestTicketAmount) : 0,
        cardPresentPct: data?.cardPresentPct != null ? Number(data.cardPresentPct) : 100,
        internetPct: data?.internetPct != null ? Number(data.internetPct) : 0,
        motoPct: data?.motoPct != null ? Number(data.motoPct) : 0,
        applicationStepStatus: 'In Review',
      };
      const merchantMID = await base44.asServiceRole.entities.MerchantMID.create(merchantMIDData);

      // Auto-create MSPWare draft immediately so signApplication doesn't have to do it lazily
      try {
        await base44.functions.invoke('submitToMSP', { corporateId, midIds: [merchantMID.id] });
      } catch (e) {
        console.warn('[manageMerchantID] submitToMSP draft creation failed (non-fatal):', e.message);
      }

      return Response.json({ merchantID: merchantMID });
    }

    // — UPDATE —
    if (action === 'update') {
      if (!merchantIDId) return Response.json({ error: 'merchantIDId is required for update' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.MerchantMID.get(merchantIDId);
      const LOCKED = ['Pending MID', 'Active', 'Active (Existing)'];
      if (existing && LOCKED.includes(existing.applicationStepStatus) && !(data?.applicationStepStatus !== undefined && Object.keys(data).length === 1)) {
        return Response.json({ error: 'Cannot edit: Application is in a locked status' }, { status: 403 });
      }
      const updateFields = {};
      const d = data || {};
      // Renaming the merchant name also updates the DBA sent to Elavon, mirroring the prior behavior.
      if (d.merchantName !== undefined) { updateFields.merchantName = d.merchantName; updateFields.dbaName = d.merchantName; }
      if (d.mccCode !== undefined) updateFields.mccCode = d.mccCode;
      if (d.industryType !== undefined) updateFields.industryType = d.industryType;
      if (d.monthlyCardSales !== undefined) updateFields.monthlyCardSales = Number(d.monthlyCardSales);
      if (d.avgSaleAmount !== undefined) updateFields.avgSaleAmount = Number(d.avgSaleAmount);
      if (d.highestTicketAmount !== undefined) updateFields.highestTicketAmount = Number(d.highestTicketAmount);
      if (d.cardPresentPct !== undefined) updateFields.cardPresentPct = Number(d.cardPresentPct);
      if (d.internetPct !== undefined) updateFields.internetPct = Number(d.internetPct);
      if (d.motoPct !== undefined) updateFields.motoPct = Number(d.motoPct);
      if (d.locationId !== undefined) updateFields.locationId = d.locationId;
      if (d.applicationStepStatus !== undefined) updateFields.applicationStepStatus = d.applicationStepStatus;
      const updated = await base44.asServiceRole.entities.MerchantMID.update(merchantIDId, updateFields);
      return Response.json({ updatedMerchantID: updated, merchantID: updated });
    }

    // — DELETE —
    if (action === 'delete') {
      if (!merchantIDId) return Response.json({ error: 'merchantIDId is required for delete' }, { status: 400 });
      const toDelete = await base44.asServiceRole.entities.MerchantMID.get(merchantIDId);
      const LOCKED = ['Pending MID', 'Active', 'Active (Existing)'];
      if (toDelete && LOCKED.includes(toDelete.applicationStepStatus)) {
        return Response.json({ error: 'Cannot delete: Application is in a locked status' }, { status: 403 });
      }
      await base44.asServiceRole.entities.MerchantMID.delete(merchantIDId);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action. Use list, add, update, or delete.' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
