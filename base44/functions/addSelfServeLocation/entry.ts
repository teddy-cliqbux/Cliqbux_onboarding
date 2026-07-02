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

    // If structured fields are missing but we have a flat address, try to parse it
    // Format expected: "123 Main St, City, ST 12345" or "123 Main St, City ST 12345"
    let parsedStreet = businessStreet || '';
    let parsedCity = businessCity || '';
    let parsedState = businessState || '';
    let parsedZip = businessZip || '';

    if (businessAddress && (!parsedStreet || !parsedCity || !parsedState || !parsedZip)) {
      // Try: "street, city, ST zip" or "street, city ST zip"
      const m = businessAddress.match(/^(.+?),\s*(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
      if (m) {
        parsedStreet = parsedStreet || m[1].trim();
        parsedCity   = parsedCity   || m[2].trim();
        parsedState  = parsedState  || m[3].toUpperCase();
        parsedZip    = parsedZip    || m[4].trim();
      }
    }

    const locationFields: Record<string, any> = {
      corporateId,
      dbaName,
      businessAddress,
      applicationStepStatus: 'In Review'
    };

    if (resolvedEntityId) locationFields.entityId = resolvedEntityId;
    if (parsedStreet) locationFields.businessStreet = parsedStreet;
    if (parsedCity)   locationFields.businessCity   = parsedCity;
    if (parsedState)  locationFields.businessState  = parsedState;
    if (parsedZip)    locationFields.businessZip    = parsedZip;

    const location = await base44.asServiceRole.entities.MerchantLocations.create(locationFields);

    // Auto-create a stub primary MID for this location
    const merchantMID = await base44.asServiceRole.entities.MerchantMID.create({
      locationId: location.id,
      corporateId,
      merchantName: dbaName,
      dbaName,
      mccCode: '',
      industryType: '',
      monthlyCardSales: 0,
      avgSaleAmount: 0,
      highestTicketAmount: 0,
      cardPresentPct: 100,
      applicationStepStatus: 'In Review',
    });

    return Response.json({ success: true, location, merchantMID });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});