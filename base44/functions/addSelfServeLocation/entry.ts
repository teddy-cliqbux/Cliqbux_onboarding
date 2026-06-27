import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, dbaName, businessAddress, entityId, businessStreet, businessCity, businessState, businessZip } = body;

    if (!corporateId || !dbaName) {
      return Response.json({ error: 'corporateId and dbaName are required' }, { status: 400 });
    }

    const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profile || profile.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }

    const locationFields: Record<string, unknown> = {
      corporateId,
      dbaName,
      businessAddress,
      applicationStepStatus: 'In Review'
    };

    if (entityId) locationFields.entityId = entityId;
    if (businessStreet) locationFields.businessStreet = businessStreet;
    if (businessCity) locationFields.businessCity = businessCity;
    if (businessState) locationFields.businessState = businessState;
    if (businessZip) locationFields.businessZip = businessZip;

    const location = await base44.asServiceRole.entities.MerchantLocations.create(locationFields);

    return Response.json({ success: true, location });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});