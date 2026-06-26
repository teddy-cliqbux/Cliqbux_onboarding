import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, dbaName, businessAddress } = body;

    if (!corporateId || !dbaName || !businessAddress) {
      return Response.json({ error: 'corporateId, dbaName, and businessAddress are required' }, { status: 400 });
    }

    const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profile || profile.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }

    const location = await base44.asServiceRole.entities.MerchantLocations.create({
      corporateId,
      dbaName,
      businessAddress,
      applicationStepStatus: 'In Review'
    });

    return Response.json({ success: true, location });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});