import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// deployed 2026-07-10 — NEW function: merchant-gated inline edits to location name/address (verify-prefill UX)

// ─── updateLocationDetails ────────────────────────────────────────────────────
// Quick inline edits to a location's name and address from the merchant portal
// (2026-07-10, Teddy: applicants must be able to painlessly correct prefilled
// location data). Only touches identity/address fields — banking, status, and
// boarding fields are owned by their own functions.
//
// POST /functions/updateLocationDetails
// Body: { locationId, dbaName?, businessStreet?, businessCity?, businessState?, businessZip?,
//         liquorLicenseDocUrl?, liquorLicenseFileName?, liquorLicenseUploadedAt? }

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
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
    const {
      locationId, dbaName, businessStreet, businessStreet2, businessCity, businessState, businessZip,
      liquorLicenseDocUrl, liquorLicenseFileName, liquorLicenseUploadedAt,
    } = body;

    if (!locationId) {
      return Response.json({ error: 'locationId is required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const loc = await base44.asServiceRole.entities.MerchantLocations.get(locationId).catch(() => null);
    if (!loc) return Response.json({ error: 'Location not found' }, { status: 404 });
    if (actor.actor === 'merchant' && String(loc.corporateId) !== actor.corporateId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Portal form lock (signing phase)
    {
      const lockProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: loc.corporateId });
      const lockProfile = lockProfiles?.[0];
      const lock = String(lockProfile?.portalLockStatus || 'unlocked').toLowerCase();
      const formsLocked = lockProfile?.applicationStatus === 'Submitted'
        || lock === 'signing' || lock === 'pending_signature' || lock === 'all_signed';
      if (formsLocked) {
        return Response.json({
          error: 'Forms are locked while the merchant agreement is in signing. Use Unlock & Modify Details first.',
          code: 'FORMS_LOCKED',
        }, { status: 423 });
      }
    }

    const update: Record<string, any> = {};
    if (dbaName !== undefined) {
      const name = String(dbaName).trim();
      if (!name) return Response.json({ error: 'Location name cannot be empty' }, { status: 400 });
      update.dbaName = name;
    }

    // Address: apply any provided parts on top of the existing ones, then
    // recompute the display string so the two never drift apart.
    const addressTouched = [businessStreet, businessStreet2, businessCity, businessState, businessZip].some(v => v !== undefined);
    if (addressTouched) {
      const street = businessStreet !== undefined ? String(businessStreet).trim() : (loc.businessStreet || '');
      const street2 = businessStreet2 !== undefined ? String(businessStreet2).trim() : (loc.businessStreet2 || '');
      const city   = businessCity   !== undefined ? String(businessCity).trim()   : (loc.businessCity || '');
      const state  = businessState  !== undefined ? String(businessState).trim().toUpperCase() : (loc.businessState || '');
      const zip    = businessZip    !== undefined ? String(businessZip).trim()    : (loc.businessZip || '');
      if (!/^\s*\d/.test(street)) {
        return Response.json({ error: 'Street address must include a street number (e.g. "123 Main St")' }, { status: 400 });
      }
      // Never let an address save blank out city/state/zip — a client that
      // loaded a record without the structured fields (pre-fix frontend) would
      // otherwise silently erase them on every edit.
      if (!city || !state || !zip) {
        return Response.json({ error: 'City, state, and ZIP are required to save an address' }, { status: 400 });
      }
      const streetLine = street2 ? `${street} ${street2}` : street;
      update.businessStreet = street;
      update.businessStreet2 = street2;
      update.businessCity = city;
      update.businessState = state;
      update.businessZip = zip;
      update.businessAddress = [streetLine, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    }

    // Post-sign liquor license upload (CA/NY + 5813). Does not gate application signing.
    if (liquorLicenseDocUrl !== undefined) {
      const url = String(liquorLicenseDocUrl || '').trim();
      if (!url) return Response.json({ error: 'liquorLicenseDocUrl cannot be empty' }, { status: 400 });
      update.liquorLicenseDocUrl = url;
      if (liquorLicenseFileName !== undefined) {
        update.liquorLicenseFileName = String(liquorLicenseFileName || '').trim();
      }
      update.liquorLicenseUploadedAt = liquorLicenseUploadedAt
        ? String(liquorLicenseUploadedAt)
        : new Date().toISOString();
    }

    if (!Object.keys(update).length) {
      return Response.json({ error: 'Nothing to update' }, { status: 400 });
    }

    await base44.asServiceRole.entities.MerchantLocations.update(locationId, update);
    return Response.json({ success: true, location: { id: locationId, ...update } });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
