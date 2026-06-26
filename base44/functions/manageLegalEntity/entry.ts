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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { corporateId, action, entityId, legalBusinessName, tradeNameDBA, federalEIN, corporateMailingAddress } = body;

    if (!corporateId || !action) {
      return Response.json({ error: 'corporateId and action are required' }, { status: 400 });
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }
    const profile = profiles[0];
    let entities = profile.legalEntities || [];
    const updateId = profile.id;

    if (action === 'list') {
      return Response.json({ entities: entities.map(e => ({ entityId: e.entityId, legalBusinessName: e.legalBusinessName, federalEIN: e.federalEIN, corporateMailingAddress: e.corporateMailingAddress || '' })) });
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
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});