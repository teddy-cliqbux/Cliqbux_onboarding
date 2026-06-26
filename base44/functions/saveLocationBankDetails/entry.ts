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
      const { id, entityId } = loc;
      if (!id) continue;

      const bankDetails = loc.bankDetails || {};
      const update = {
        bankDetails: {
          routingNumber: bankDetails.routingNumber || bankDetails.accountNumber ? (bankDetails.routingNumber || null) : null,
          accountNumber: bankDetails.accountNumber || bankDetails.routingNumber ? (bankDetails.accountNumber || null) : null,
          accountNumberMasked: bankDetails.accountNumberMasked || null,
          accountType: bankDetails.accountType || null,
          authMethod: bankDetails.authMethod || null,
        }
      };
      // Preserve entityId on the location record (maps to a LegalEntity)
      if (entityId) update.entityId = entityId;
      if (update.bankDetails.routingNumber || update.bankDetails.accountNumber) {
        await base44.asServiceRole.entities.MerchantLocations.update(id, update);
      }
      results.push({ id, saved: true });
    }

    return Response.json({ success: true, updated: results.length, results });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});