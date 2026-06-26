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
      hasTaxId: !!profile.taxId
    };

    const locations = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });

    const safeLocations = (locations || []).map(loc => ({
      id: loc.id,
      locationId: loc.locationId,
      corporateId: loc.corporateId,
      dbaName: loc.dbaName,
      businessAddress: loc.businessAddress,
      hasRoutingNumber: !!loc.routingNumber,
      hasAccountNumber: !!loc.accountNumber,
      elavonMID: loc.elavonMID,
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