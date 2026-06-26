import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { corporateId } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
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

    return Response.json({
      profile: safeProfile,
      locations: safeLocations
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});