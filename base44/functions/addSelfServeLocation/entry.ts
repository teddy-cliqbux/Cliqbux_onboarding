import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, dbaName, businessAddress, entityId, businessStreet, businessCity, businessState, businessZip,
            newEntityName, newEntityEIN } = body;

    if (!corporateId || !dbaName) {
      return Response.json({ error: 'corporateId and dbaName are required' }, { status: 400 });
    }

    const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profile || profile.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }

    // If caller wants a new entity created, do it here with service role (avoids auth issues on magic-link sessions)
    let resolvedEntityId = entityId;
    if (!resolvedEntityId && newEntityName && newEntityEIN) {
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      if (profiles && profiles.length > 0) {
        const profileRecord = profiles[0];
        const entities = profileRecord.legalEntities || [];
        const newEntity = { entityId: randomUUID(), legalBusinessName: newEntityName.trim(), tradeNameDBA: newEntityName.trim(), federalEIN: newEntityEIN.trim() };
        await base44.asServiceRole.entities.MerchantCorporateProfile.update(profileRecord.id, {
          legalEntities: [...entities, newEntity]
        });
        resolvedEntityId = newEntity.entityId;
      }
    }

    const locationFields = {
      corporateId,
      dbaName,
      businessAddress,
      applicationStepStatus: 'In Review'
    };

    if (resolvedEntityId) locationFields.entityId = resolvedEntityId;
    if (businessStreet) locationFields.businessStreet = businessStreet;
    if (businessCity) locationFields.businessCity = businessCity;
    if (businessState) locationFields.businessState = businessState;
    if (businessZip) locationFields.businessZip = businessZip;

    const location = await base44.asServiceRole.entities.MerchantLocations.create(locationFields);

    // Auto-create a stub primary MID for this location
    const concept = await base44.asServiceRole.entities.MerchantProcessingConcept.create({
      locationId: location.id,
      corporateId,
      conceptName: dbaName,
      dbaName,
      mccCode: '',
      industryType: '',
      monthlyCardSales: 0,
      avgSaleAmount: 0,
      highestTicketAmount: 0,
      cardPresentPct: 100,
      applicationStepStatus: 'In Review',
    });

    return Response.json({ success: true, location, concept });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});