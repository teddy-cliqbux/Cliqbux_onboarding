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
    const { corporateId, action, entityId, legalBusinessName, tradeNameDBA, federalEIN, corporateMailingAddress, mailingStreet, mailingCity, mailingState, mailingZip, ownershipType, taxClassType, establishmentYear } = body;

    if (!corporateId || !action) {
      return Response.json({ error: 'corporateId and action are required' }, { status: 400 });
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    // Defensive: Base44 sometimes returns JSON fields as strings — parse if needed
    let rawEntities = profile.legalEntities ?? [];
    if (typeof rawEntities === 'string') {
      try { rawEntities = JSON.parse(rawEntities); } catch { rawEntities = []; }
    }
    let entities: any[] = Array.isArray(rawEntities) ? rawEntities : [];
    const updateId = profile.id;

    if (action === 'edit') {
      if (!entityId) {
        return Response.json({ error: 'entityId is required' }, { status: 400 });
      }
      const idx = entities.findIndex(e => e.entityId === entityId);
      if (idx === -1) {
        return Response.json({ error: 'Entity not found' }, { status: 404 });
      }
      if (legalBusinessName !== undefined) entities[idx].legalBusinessName = legalBusinessName.trim();
      if (tradeNameDBA !== undefined) entities[idx].tradeNameDBA = tradeNameDBA.trim();
      if (federalEIN !== undefined) entities[idx].federalEIN = federalEIN.trim();
      if (corporateMailingAddress !== undefined) entities[idx].corporateMailingAddress = (corporateMailingAddress || '').trim();
      if (mailingStreet !== undefined) entities[idx].mailingStreet = (mailingStreet || '').trim();
      if (mailingCity !== undefined) entities[idx].mailingCity = (mailingCity || '').trim();
      if (mailingState !== undefined) entities[idx].mailingState = (mailingState || '').trim();
      if (mailingZip !== undefined) entities[idx].mailingZip = (mailingZip || '').trim();
      if (ownershipType !== undefined) entities[idx].ownershipType = ownershipType;
      if (taxClassType !== undefined) entities[idx].taxClassType = taxClassType;
      if (establishmentYear !== undefined) entities[idx].establishmentYear = establishmentYear;
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(updateId, { legalEntities: entities });
      return Response.json({ success: true, entities });
    }

    if (action === 'list') {
      return Response.json({ entities: entities.map(e => ({ entityId: e.entityId, legalBusinessName: e.legalBusinessName, federalEIN: e.federalEIN, corporateMailingAddress: e.corporateMailingAddress || '', mailingStreet: e.mailingStreet || '', mailingCity: e.mailingCity || '', mailingState: e.mailingState || '', mailingZip: e.mailingZip || '', ownershipType: e.ownershipType || '', taxClassType: e.taxClassType || '', establishmentYear: e.establishmentYear || '' })) });
    }

    if (action === 'add') {
      if (!legalBusinessName || !federalEIN) {
        return Response.json({ error: 'legalBusinessName and federalEIN are required' }, { status: 400 });
      }
      entities = entities.concat({ entityId: randomUUID(), legalBusinessName: legalBusinessName.trim(), tradeNameDBA: (tradeNameDBA || legalBusinessName).trim(), federalEIN: federalEIN.trim(), corporateMailingAddress: (corporateMailingAddress || '').trim() });
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(updateId, { legalEntities: entities });
      return Response.json({ success: true, entities });
    }

    if (action === 'delete') {
      if (!entityId) {
        return Response.json({ error: 'entityId is required' }, { status: 400 });
      }
      entities = entities.filter(e => e.entityId !== entityId);
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(updateId, { legalEntities: entities });

      // Restore orphaned locations back to In Review
      await base44.asServiceRole.entities.MerchantLocations.updateMany({ corporateId, entityId }, { $set: { entityId: null, applicationStepStatus: 'In Review' } });
      return Response.json({ success: true, entities });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[manageLegalEntity] uncaught error:', error?.message, error?.stack?.split('\n').slice(0,3).join(' | '));
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});