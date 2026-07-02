import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { locationId } = body;

    if (!locationId) {
      return Response.json({ error: 'locationId is required' }, { status: 400 });
    }

    // Delete all MIDs (MerchantMID) for this location first
    const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ locationId });
    for (const c of merchantMIDs) {
      await base44.asServiceRole.entities.MerchantMID.delete(c.id);
    }
    await base44.asServiceRole.entities.MerchantLocations.delete(locationId);
    return Response.json({ success: true, deletedMIDs: merchantMIDs.length });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});