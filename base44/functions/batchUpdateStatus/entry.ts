import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { corporateId, action, locationIds, newStatus, targetEntityId } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    // ── Update status for multiple locations  ──────────
    if (action === 'updateStatus') {
      if (!locationIds?.length || !newStatus) {
        return Response.json({ error: 'locationIds and newStatus are required' }, { status: 400 });
      }

      const valid = ['In Review', 'Ready to Submit', 'Pending MID', 'Active', 'Error'];
      if (!valid.includes(newStatus)) {
        return Response.json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` }, { status: 400 });
      }

      // Update matching locations
      await base44.asServiceRole.entities.MerchantLocations.updateMany(
        { corporateId, id: { $in: locationIds } },
        { $set: { applicationStepStatus: newStatus } }
      );

      // Also update all concepts under those locations
      for (const locId of locationIds) {
        await base44.asServiceRole.entities.MerchantProcessingConcept.updateMany(
          { corporateId, locationId: locId },
          { $set: { applicationStepStatus: newStatus } }
        );
      }

      return Response.json({ success: true, updatedLocations: locationIds.length });
    }

    // ── Move locations to a different entity ──────────
    if (action === 'moveToEntity') {
      if (!locationIds?.length || !targetEntityId) {
        return Response.json({ error: 'locationIds and targetEntityId are required' }, { status: 400 });
      }

      // Verify the target entity exists on this corporate profile
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const profile = profiles?.[0];
      if (!profile) {
        return Response.json({ error: 'Corporate profile not found' }, { status: 404 });
      }

      const entityExists = (profile.legalEntities || []).some(e => e.entityId === targetEntityId);
      if (!entityExists) {
        return Response.json({ error: 'Target entity not found on this corporate profile' }, { status: 400 });
      }

      await base44.asServiceRole.entities.MerchantLocations.updateMany(
        { corporateId, id: { $in: locationIds } },
        { $set: { entityId: targetEntityId } }
      );

      return Response.json({ success: true, movedLocations: locationIds.length, targetEntityId });
    }

    // ── Copy locations to a different entity ──────────
    if (action === 'copyToEntity') {
      if (!locationIds?.length || !targetEntityId) {
        return Response.json({ error: 'locationIds and targetEntityId are required' }, { status: 400 });
      }

      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const profile = profiles?.[0];
      if (!profile) {
        return Response.json({ error: 'Corporate profile not found' }, { status: 404 });
      }

      const entityExists = (profile.legalEntities || []).some(e => e.entityId === targetEntityId);
      if (!entityExists) {
        return Response.json({ error: 'Target entity not found on this corporate profile' }, { status: 400 });
      }

      const locations = await base44.asServiceRole.entities.MerchantLocations.filter({
        corporateId, id: { $in: locationIds }
      });

      let copied = 0;
      for (const loc of locations) {
        const newLoc = await base44.asServiceRole.entities.MerchantLocations.create({
          corporateId,
          entityId: targetEntityId,
          dbaName: loc.dbaName,
          businessAddress: loc.businessAddress,
          businessStreet: loc.businessStreet || '',
          businessCity: loc.businessCity || '',
          businessState: loc.businessState || '',
          businessZip: loc.businessZip || '',
          applicationStepStatus: 'In Review',
        });

        // Copy concepts too
        const concepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({
          corporateId, locationId: loc.id
        });

        if (concepts?.length) {
          await base44.asServiceRole.entities.MerchantProcessingConcept.bulkCreate(
            concepts.map(c => ({
              locationId: newLoc.id,
              corporateId,
              conceptName: c.conceptName || '',
              dbaName: c.dbaName || '',
              mccCode: c.mccCode || '',
              industryType: c.industryType || '',
              monthlyCardSales: c.monthlyCardSales ?? 0,
              avgSaleAmount: c.avgSaleAmount ?? 0,
              highestTicketAmount: c.highestTicketAmount ?? 0,
              cardPresentPct: c.cardPresentPct ?? 100,
              productDescription: c.productDescription || '',
              applicationStepStatus: 'In Review',
            }))
          );
        }

        copied++;
      }

      return Response.json({ success: true, copiedLocations: copied, targetEntityId });
    }

    // ── Duplicate location (clone in-place) ──────────
    if (action === 'duplicateLocation') {
      if (!locationIds?.length) {
        return Response.json({ error: 'locationIds is required' }, { status: 400 });
      }

      const locations = await base44.asServiceRole.entities.MerchantLocations.filter({
        corporateId, id: { $in: locationIds }
      });

      if (!locations?.length) {
        return Response.json({ error: 'No locations found' }, { status: 404 });
      }

      let duplicated = 0;
      for (const loc of locations) {
        const newLoc = await base44.asServiceRole.entities.MerchantLocations.create({
          corporateId,
          entityId: loc.entityId || '',
          dbaName: `${loc.dbaName || 'Location'} (Copy)`,
          businessAddress: loc.businessAddress || '',
          businessStreet: loc.businessStreet || '',
          businessCity: loc.businessCity || '',
          businessState: loc.businessState || '',
          businessZip: loc.businessZip || '',
          applicationStepStatus: 'In Review',
        });

        // Clone its concepts
        const concepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({
          corporateId, locationId: loc.id
        });

        if (concepts?.length) {
          await base44.asServiceRole.entities.MerchantProcessingConcept.bulkCreate(
            concepts.map(c => ({
              locationId: newLoc.id,
              corporateId,
              conceptName: c.conceptName || '',
              dbaName: c.dbaName || '',
              mccCode: c.mccCode || '',
              industryType: c.industryType || '',
              monthlyCardSales: c.monthlyCardSales ?? 0,
              avgSaleAmount: c.avgSaleAmount ?? 0,
              highestTicketAmount: c.highestTicketAmount ?? 0,
              cardPresentPct: c.cardPresentPct ?? 100,
              productDescription: c.productDescription || '',
              applicationStepStatus: 'In Review',
            }))
          );
        }

        duplicated++;
      }

      return Response.json({ success: true, duplicatedLocations: duplicated });
    }

    return Response.json({ error: 'Unknown action. Use updateStatus, moveToEntity, copyToEntity, or duplicateLocation.' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});