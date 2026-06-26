import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { corporateId } = await req.json();

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    const locations = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });
    return Response.json({ locations });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});