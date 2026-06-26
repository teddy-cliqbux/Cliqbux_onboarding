import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, ...fields } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    // Allowed fields to update
    const ALLOWED = [
      'firstName', 'lastName', 'dobYear', 'dobMonth', 'dobDay',
      'ssn', 'homeStreet', 'homeCity', 'homeState', 'homeZip',
      'taxId', 'isManualMode', 'applicationStatus',
      'corporatePhone', 'ownershipPercentage'
    ];

    const update = {};
    for (const key of ALLOWED) {
      if (fields[key] !== undefined) update[key] = fields[key];
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    const updated = await base44.asServiceRole.entities.MerchantCorporateProfile.update(profiles[0].id, update);
    return Response.json({ success: true, profile: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});