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
    const { corporateId, action, entityId, legalBusinessName, tradeNameDBA, federalEIN, corporateMailingAddress, mailingStreet, mailingCity, mailingState, mailingZip, ownershipType, taxClassType, establishmentYear } = body;

    if (!corporateId || !action) {
      return Response.json({ error: 'corporateId and action are required' }, { status: 400 });
    }
    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    // Portal form lock (signing phase) — list stays allowed; mutations blocked
    if (action !== 'list') {
      const lock = String(profile.portalLockStatus || 'unlocked').toLowerCase();
      const locked = profile.applicationStatus === 'Submitted'
        || lock === 'signing' || lock === 'pending_signature' || lock === 'all_signed';
      if (locked) {
        return Response.json({
          error: 'Forms are locked while the merchant agreement is in signing. Use Unlock & Modify Details first.',
          code: 'FORMS_LOCKED',
        }, { status: 423 });
      }
    }

    // Defensive: Base44 sometimes returns JSON fields as strings — parse if needed
    let rawEntities = profile.legalEntities ?? [];
    if (typeof rawEntities === 'string') {
      try { rawEntities = JSON.parse(rawEntities); } catch { rawEntities = []; }
    }
    let entities: any[] = Array.isArray(rawEntities) ? rawEntities : [];
    const updateId = profile.id;

    if (action === 'edit') {
      if (!entityId) {
        return Response.json({ error: 'entityId is required' }, { status: 400 });
      }
      const idx = entities.findIndex(e => e.entityId === entityId);
      if (idx === -1) {
        return Response.json({ error: 'Entity not found' }, { status: 404 });
      }
      // Build a clean replacement object with all known fields to avoid partial-update data loss
      const existing = entities[idx];
      entities[idx] = {
        entityId: existing.entityId,
        legalBusinessName: legalBusinessName !== undefined ? legalBusinessName.trim() : (existing.legalBusinessName || ''),
        tradeNameDBA: tradeNameDBA !== undefined ? tradeNameDBA.trim() : (existing.tradeNameDBA || ''),
        federalEIN: federalEIN !== undefined ? federalEIN.trim() : (existing.federalEIN || ''),
        corporateMailingAddress: corporateMailingAddress !== undefined ? (corporateMailingAddress || '').trim() : (existing.corporateMailingAddress || ''),
        mailingStreet: mailingStreet !== undefined ? (mailingStreet || '').trim() : (existing.mailingStreet || ''),
        mailingCity: mailingCity !== undefined ? (mailingCity || '').trim() : (existing.mailingCity || ''),
        mailingState: mailingState !== undefined ? (mailingState || '').trim() : (existing.mailingState || ''),
        mailingZip: mailingZip !== undefined ? (mailingZip || '').trim() : (existing.mailingZip || ''),
        ownershipType: ownershipType !== undefined ? ownershipType : (existing.ownershipType || ''),
        taxClassType: taxClassType !== undefined ? taxClassType : (existing.taxClassType || ''),
        establishmentYear: establishmentYear !== undefined ? establishmentYear : (existing.establishmentYear || ''),
      };
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(updateId, { legalEntities: entities });
      return Response.json({ success: true, entities });
    }

    if (action === 'list') {
      return Response.json({ entities: entities.map(e => ({ entityId: e.entityId, legalBusinessName: e.legalBusinessName, federalEIN: e.federalEIN, corporateMailingAddress: e.corporateMailingAddress || '', mailingStreet: e.mailingStreet || '', mailingCity: e.mailingCity || '', mailingState: e.mailingState || '', mailingZip: e.mailingZip || '', ownershipType: e.ownershipType || '', taxClassType: e.taxClassType || '', establishmentYear: e.establishmentYear || '' })) });
    }

    if (action === 'add') {
      if (!legalBusinessName) {
        return Response.json({ error: 'legalBusinessName is required' }, { status: 400 });
      }
      // federalEIN is OPTIONAL here — fixed 2026-07-07. This action is used both
      // for the auto-seeded "primary entity" (created from the Company Name
      // collected at signup, before any EIN has ever been asked for) and for a
      // user explicitly adding a second/different legal entity later. Requiring
      // federalEIN unconditionally meant the auto-seed call in
      // OnboardingLocations.jsx's loadAll() ALWAYS failed with a 400 (self-serve
      // signup never collects an EIN), silently leaving entities empty and
      // forcing merchants to discover the tiny "+ New Legal Entity" toggle just
      // to add their first location. The EIN can now be filled in later via
      // EntityDetailsPanel. See AGENTS.md.
      entities = entities.concat({ entityId: randomUUID(), legalBusinessName: legalBusinessName.trim(), tradeNameDBA: (tradeNameDBA || legalBusinessName).trim(), federalEIN: (federalEIN || '').trim(), corporateMailingAddress: (corporateMailingAddress || '').trim() });
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(updateId, { legalEntities: entities });
      return Response.json({ success: true, entities });
    }

    if (action === 'delete') {
      if (!entityId) {
        return Response.json({ error: 'entityId is required' }, { status: 400 });
      }
      entities = entities.filter(e => e.entityId !== entityId);
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(updateId, { legalEntities: entities });

      // Restore orphaned locations back to In Review
      await base44.asServiceRole.entities.MerchantLocations.updateMany({ corporateId, entityId }, { $set: { entityId: null, applicationStepStatus: 'In Review' } });
      return Response.json({ success: true, entities });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[manageLegalEntity] uncaught error:', error?.message, error?.stack?.split('\n').slice(0,3).join(' | '));
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
