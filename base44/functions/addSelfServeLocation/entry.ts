import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, dbaName, businessAddress, entityId } = body;

    if (!corporateId || !dbaName || !businessAddress) {
      return Response.json({ error: 'corporateId, dbaName, and businessAddress are required' }, { status: 400 });
    }

    const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    // Profile check is soft — only reject when we need a profile-level entity lookup
    if (!profile || profile.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }

    // Convert entityId list to a location array field
    const locationFields = {
      corporateId,
      dbaName,
      businessAddress,
      applicationStepStatus: 'In Review'
    };

    // If entityId is present but doesn't match an existing entity-related field,
    // we skip it. The frontend will assign locations to entities upon next load.
    if (entityId) {
      locationFields.entityId = entityId;
    }

    const location = await base44.asServiceRole.entities.MerchantLocations.create(locationFields);

    return Response.json({ success: true, location });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});