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

function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, dbaName, businessAddress, entityId, businessStreet, businessCity, businessState, businessZip,
            newEntityName, newEntityEIN } = body;

    if (!corporateId || !dbaName) {
      return Response.json({ error: 'corporateId and dbaName are required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profile || profile.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }

    {
      const lockProfile = profile[0];
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

    // If caller wants a new entity created, do it here with service role (avoids auth issues on magic-link sessions)
    let resolvedEntityId = entityId;
    if (!resolvedEntityId && newEntityName && newEntityEIN) {
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      if (profiles && profiles.length > 0) {
        const profileRecord = profiles[0];
        const entities = profileRecord.legalEntities || [];
        const newEntity = { entityId: randomUUID(), legalBusinessName: newEntityName.trim(), tradeNameDBA: newEntityName.trim(), federalEIN: newEntityEIN.trim() };
        await base44.asServiceRole.entities.MerchantCorporateProfile.update(profileRecord.id, {
          legalEntities: [...entities, newEntity]
        });
        resolvedEntityId = newEntity.entityId;
      }
    }

    // If structured fields are missing but we have a flat address, try to parse it
    // Format expected: "123 Main St, City, ST 12345" or "123 Main St, City ST 12345"
    let parsedStreet = businessStreet || '';
    let parsedCity = businessCity || '';
    let parsedState = businessState || '';
    let parsedZip = businessZip || '';

    if (businessAddress && (!parsedStreet || !parsedCity || !parsedState || !parsedZip)) {
      // Try: "street, city, ST zip" or "street, city ST zip"
      const m = businessAddress.match(/^(.+?),\s*(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
      if (m) {
        parsedStreet = parsedStreet || m[1].trim();
        parsedCity   = parsedCity   || m[2].trim();
        parsedState  = parsedState  || m[3].toUpperCase();
        parsedZip    = parsedZip    || m[4].trim();
      }
    }

    const locationFields: Record<string, any> = {
      corporateId,
      dbaName,
      businessAddress,
      applicationStepStatus: 'In Review'
    };

    if (resolvedEntityId) locationFields.entityId = resolvedEntityId;
    if (parsedStreet) locationFields.businessStreet = parsedStreet;
    if (parsedCity)   locationFields.businessCity   = parsedCity;
    if (parsedState)  locationFields.businessState  = parsedState;
    if (parsedZip)    locationFields.businessZip    = parsedZip;

    const location = await base44.asServiceRole.entities.MerchantLocations.create(locationFields);

    // Derive pricingMethod from the merchant's chosen pricingTier — must be set
    // explicitly, since MerchantMID.pricingMethod's schema default ('ICPLS')
    // would otherwise silently override a Cash Discount merchant's real method.
    const pricingMethod = TIER_TO_METHOD[(profile[0]?.pricingTier || '').toUpperCase()] || 'ICPLS';

    // Auto-create a stub primary MID for this location
    const merchantMID = await base44.asServiceRole.entities.MerchantMID.create({
      locationId: location.id,
      corporateId,
      merchantName: dbaName,
      dbaName,
      mccCode: '',
      industryType: '',
      pricingMethod,
      monthlyCardSales: 0,
      avgSaleAmount: 0,
      highestTicketAmount: 0,
      cardPresentPct: 100,
      applicationStepStatus: 'In Review',
    });

    return Response.json({ success: true, location, merchantMID });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
