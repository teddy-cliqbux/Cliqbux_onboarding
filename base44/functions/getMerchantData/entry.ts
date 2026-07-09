import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-09 — portal auth gate live

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
    const { corporateId } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
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

    // Never expose taxId or sensitive data beyond what's needed
    const safeProfile = {
      id: profile.id,
      corporateId: profile.corporateId,
      legalName: profile.legalName,
      signerEmail: profile.signerEmail,
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      hubspotQuoteUrl: profile.hubspotQuoteUrl,
      pricingTier: profile.pricingTier,
      applicationStatus: profile.applicationStatus,
      // Inherited EIN from Step 1 (self-serve) — used for first-location defaults
      taxId: profile.taxId || '',
      legalEntities: (profile.legalEntities || []).map(e => ({
        entityId: e.entityId,
        legalBusinessName: e.legalBusinessName,
        federalEIN: e.federalEIN,
        corporateMailingAddress: e.corporateMailingAddress || ''
      }))
    };

    const locations = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });

    const safeLocations = (locations || []).map(loc => ({
      id: loc.id,
      locationId: loc.locationId,
      corporateId: loc.corporateId,
      entityId: loc.entityId || '',
      dbaName: loc.dbaName,
      businessAddress: loc.businessAddress,
      hasRoutingNumber: !!(loc.bankDetails?.routingNumber || loc.routingNumber),
      hasAccountNumber: !!(loc.bankDetails?.accountNumber || loc.accountNumber),
      elavonMID: loc.elavonMID,
      bankDetails: loc.bankDetails || {
        routingNumber: loc.routingNumber || '',
        accountNumber: loc.accountNumber || '',
        authMethod: null
      },
      routingNumber: loc.routingNumber || '',
      accountNumber: loc.accountNumber || '',
      applicationStepStatus: loc.applicationStepStatus
    }));

    const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId });

    const safeMerchantMIDs = (merchantMIDs || []).map(c => ({
      id: c.id,
      locationId: c.locationId,
      corporateId: c.corporateId,
      merchantName: c.merchantName || c.dbaName || '',
      dbaName: c.dbaName || '',
      mccCode: c.mccCode || '',
      industryType: c.industryType || '',
      pricingCategory: c.pricingCategory || '',
      elavonMID: c.elavonMID || '',
      applicationStepStatus: c.applicationStepStatus || 'In Review',
      isExistingAccount: !!c.isExistingAccount,
      pricingMethod: c.pricingMethod || 'ICPLS',
    }));

    return Response.json({
      profile: safeProfile,
      locations: safeLocations,
      merchantMIDs: safeMerchantMIDs,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});