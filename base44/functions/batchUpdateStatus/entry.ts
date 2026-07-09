import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
// getPortalActor returns { actor: 'merchant', corporateId } when the request
// carries a valid merchant JWT (issued by validateResumeToken, createHubspotDeal,
// or manageStagedApplication 'validate'), { actor: 'admin' } when it carries a
// Base44 workspace session, or null when neither. Callers must 401 on null and
// enforce corporateId match for merchant actors.
function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getPortalActor(req: Request, base44: any): Promise<{ actor: 'merchant' | 'admin'; corporateId?: string } | null> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify('HMAC', key, __b64uDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (ok) {
        const payload = JSON.parse(new TextDecoder().decode(__b64uDecode(parts[1])));
        if (payload.corporateId && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000) {
          return { actor: 'merchant', corporateId: String(payload.corporateId) };
        }
      }
    }
  } catch { /* invalid merchant token — fall through to workspace check */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no workspace session */ }
  return null;
}


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, action, locationIds, newStatus, targetEntityId } = body;

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }


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

      // Also update all merchantMIDs under those locations
      for (const locId of locationIds) {
        await base44.asServiceRole.entities.MerchantMID.updateMany(
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

        // Copy merchantMIDs too
        const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({
          corporateId, locationId: loc.id
        });

        if (merchantMIDs?.length) {
          await base44.asServiceRole.entities.MerchantMID.bulkCreate(
            merchantMIDs.map(c => ({
              locationId: newLoc.id,
              corporateId,
              merchantName: c.merchantName || '',
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

        // Clone its merchantMIDs
        const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({
          corporateId, locationId: loc.id
        });

        if (merchantMIDs?.length) {
          await base44.asServiceRole.entities.MerchantMID.bulkCreate(
            merchantMIDs.map(c => ({
              locationId: newLoc.id,
              corporateId,
              merchantName: c.merchantName || '',
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