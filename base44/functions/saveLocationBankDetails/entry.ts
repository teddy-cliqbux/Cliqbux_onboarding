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
    const { locations } = body;

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return Response.json({ error: 'locations array is required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const results = [];
    for (const loc of locations) {
      const { id, entityId } = loc;
      if (!id) continue;

      const bankDetails = loc.bankDetails || {};
      const update = {
        bankDetails: {
          routingNumber: bankDetails.routingNumber || bankDetails.accountNumber ? (bankDetails.routingNumber || null) : null,
          accountNumber: bankDetails.accountNumber || bankDetails.routingNumber ? (bankDetails.accountNumber || null) : null,
          accountNumberMasked: bankDetails.accountNumberMasked || null,
          accountType: bankDetails.accountType || null,
          authMethod: bankDetails.authMethod || null,
          // Optional display fields for the portal confirmation card (Plaid institution / account nickname)
          institutionName: bankDetails.institutionName || null,
          accountName: bankDetails.accountName || null,
        }
      };
      // Preserve entityId on the location record (maps to a LegalEntity)
      if (entityId) update.entityId = entityId;
      if (update.bankDetails.routingNumber || update.bankDetails.accountNumber) {
        // Merchant actors may only write bank details to their own locations
        if (actor.actor === 'merchant') {
          const rec = await base44.asServiceRole.entities.MerchantLocations.get(id).catch(() => null);
          if (!rec || String(rec.corporateId) !== actor.corporateId) {
            results.push({ id, saved: false, error: 'Unauthorized' });
            continue;
          }
        }
        await base44.asServiceRole.entities.MerchantLocations.update(id, update);
      }
      results.push({ id, saved: true });
    }

    return Response.json({ success: true, updated: results.length, results });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});