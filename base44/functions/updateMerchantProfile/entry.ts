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


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, ...fields } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Allowed fields to update (also accept nested `fields` from portal callers)
    const ALLOWED = [
      'firstName', 'lastName', 'dobYear', 'dobMonth', 'dobDay',
      'ssn', 'homeStreet', 'homeCity', 'homeState', 'homeZip',
      'taxId', 'isManualMode', 'applicationStatus',
      'corporatePhone', 'ownershipPercentage',
      'legalName', 'ownershipType', 'taxClassType', 'titleType',
      'productDescription', 'establishmentYear',
      'currentOwnershipYears', 'currentOwnershipMonths',
      'monthlyCardSales', 'avgSaleAmount', 'highestTicketAmount', 'annualRevenue',
    ];

    const nested = fields.fields && typeof fields.fields === 'object' ? fields.fields : {};
    const candidate = { ...nested, ...fields };
    delete candidate.fields;

    const update = {};
    for (const key of ALLOWED) {
      if (candidate[key] !== undefined) update[key] = candidate[key];
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    // On first submit → underwriting handoff (do not clobber an agent-set stage).
    if (update.applicationStatus === 'Submitted' && !profiles[0].handoffStage) {
      update.handoffStage = 'underwriting';
      update.handoffStageUpdatedAt = new Date().toISOString();
      update.handoffStageUpdatedBy = 'system:submit';
    }

    const updated = await base44.asServiceRole.entities.MerchantCorporateProfile.update(profiles[0].id, update);
    return Response.json({ success: true, profile: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});