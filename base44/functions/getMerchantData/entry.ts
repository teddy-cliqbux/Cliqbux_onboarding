import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-10 — readiness report (per-record missing-field lists) + legalEntities fields restored to safeProfile (ownershipType/taxClassType/establishmentYear/mailing)

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
      quoteSignedAt: profile.quoteSignedAt || null,
      equipmentPaidAt: profile.equipmentPaidAt || null,
      equipmentShippingStatus: profile.equipmentShippingStatus || null,
      // Inherited EIN from Step 1 (self-serve) — used for first-location defaults
      taxId: profile.taxId || '',
      legalEntities: (profile.legalEntities || []).map(e => ({
        entityId: e.entityId,
        legalBusinessName: e.legalBusinessName,
        federalEIN: e.federalEIN,
        corporateMailingAddress: e.corporateMailingAddress || '',
        // Required for the entity details panel + readiness checks — these were
        // previously stripped here, so prefilled values never reached the UI
        ownershipType: e.ownershipType || '',
        taxClassType: e.taxClassType || '',
        establishmentYear: e.establishmentYear || '',
        mailingStreet: e.mailingStreet || '',
        mailingCity: e.mailingCity || '',
        mailingState: e.mailingState || '',
        mailingZip: e.mailingZip || ''
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
      businessStreet: loc.businessStreet || '',
      businessCity: loc.businessCity || '',
      businessState: loc.businessState || '',
      businessZip: loc.businessZip || '',
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

    // ── Readiness — drives the portal's milestone states ──────────────────────
    // "Complete" must mean the data can actually build a valid MSPWare
    // application, not merely that records exist. HubSpot prefill creates
    // partially-filled records, so the portal must tell the applicant exactly
    // what still needs their input at each level (Teddy, 2026-07-10).
    let entsRaw = profile.legalEntities ?? [];
    if (typeof entsRaw === 'string') { try { entsRaw = JSON.parse(entsRaw); } catch { entsRaw = []; } }
    const ents = Array.isArray(entsRaw) ? entsRaw : [];

    const entityIssues = ents.map((e) => {
      const missing = [];
      if (!e.legalBusinessName) missing.push('legal business name');
      if (!/^\d{9}$/.test(String(e.federalEIN || '').replace(/\D/g, ''))) missing.push('federal EIN');
      if (!e.ownershipType) missing.push('business entity type');
      if (e.ownershipType === 'LIMITED_COMPANY' && !e.taxClassType) missing.push('IRS tax classification');
      if (!e.establishmentYear) missing.push('year established');
      return { entityId: e.entityId, name: e.legalBusinessName || 'Legal entity', missing };
    }).filter((e) => e.missing.length > 0);
    if (ents.length === 0) {
      entityIssues.push({ entityId: null, name: 'Legal entity', missing: ['business details (entity type, EIN, year established)'] });
    }

    const locationIssues = (locations || []).map((l) => {
      const missing = [];
      const street = l.businessStreet || l.businessAddress || '';
      if (!/^\s*\d/.test(String(street))) missing.push('street address with a street number');
      if (!l.businessCity && !l.businessZip) missing.push('city/state/ZIP');
      return { id: l.id, dbaName: l.dbaName || 'Location', missing };
    }).filter((l) => l.missing.length > 0);

    const midIssues = (merchantMIDs || []).map((c) => {
      const missing = [];
      if (!c.mccCode) missing.push('MCC code');
      if (!c.industryType) missing.push('industry type');
      if (!(parseFloat(c.monthlyCardSales) > 0)) missing.push('monthly volume');
      if (!(parseFloat(c.avgSaleAmount) > 0)) missing.push('average sale');
      if (!(parseFloat(c.highestTicketAmount) > 0)) missing.push('highest ticket');
      if (c.cardPresentPct == null || c.cardPresentPct === '') missing.push('card split');
      return { id: c.id, dbaName: c.dbaName || c.merchantName || 'Merchant ID', missing };
    }).filter((c) => c.missing.length > 0);

    const readiness = {
      entities: entityIssues,
      locations: locationIssues,
      mids: midIssues,
      complete: (locations || []).length > 0 && entityIssues.length === 0 && locationIssues.length === 0 && midIssues.length === 0,
    };

    return Response.json({
      profile: safeProfile,
      locations: safeLocations,
      merchantMIDs: safeMerchantMIDs,
      readiness,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});