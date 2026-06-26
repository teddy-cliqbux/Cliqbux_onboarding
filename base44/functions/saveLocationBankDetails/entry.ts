import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { locations } = body;

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return Response.json({ error: 'locations array is required' }, { status: 400 });
    }

    const results = [];
    for (const loc of locations) {
      const { id, routingNumber, accountNumber } = loc;
      if (!id) continue;

      await base44.asServiceRole.entities.MerchantLocations.update(id, {
        routingNumber: routingNumber || null,
        accountNumber: accountNumber || null
      });
      results.push({ id, saved: true });
    }

    return Response.json({ success: true, updated: results.length, results });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});