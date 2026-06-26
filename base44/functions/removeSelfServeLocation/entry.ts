import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { locationId } = body;

    if (!locationId) {
      return Response.json({ error: 'locationId is required' }, { status: 400 });
    }

    await base44.asServiceRole.entities.MerchantLocations.delete(locationId);
    return Response.json({ success: true });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});