import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { locationId } = body;

    if (!locationId) {
      return Response.json({ error: 'locationId is required' }, { status: 400 });
    }

    // Delete all MIDs (MerchantProcessingConcept) for this location first
    const concepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({ locationId });
    for (const c of concepts) {
      await base44.asServiceRole.entities.MerchantProcessingConcept.delete(c.id);
    }
    await base44.asServiceRole.entities.MerchantLocations.delete(locationId);
    return Response.json({ success: true, deletedMIDs: concepts.length });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});