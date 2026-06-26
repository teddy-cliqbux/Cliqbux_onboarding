import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const payload = await req.json();
    const {
      dealId,
      legalName,
      signerEmail,
      hubspotQuoteUrl,
      pricingTier,
      customMarkupPercentage,
      customPerTxFee,
      locations = [],
      eventType
    } = payload;

    // Handle quote-signed event separately
    if (eventType === 'quote_signed' && dealId) {
      const existing = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: dealId });
      if (existing && existing.length > 0) {
        await base44.asServiceRole.entities.MerchantCorporateProfile.update(existing[0].id, {
          applicationStatus: 'Quote Signed'
        });
        return Response.json({ success: true, action: 'status_updated', status: 'Quote Signed' });
      }
      return Response.json({ error: 'Corporate profile not found' }, { status: 404 });
    }

    // Main APPROVED webhook — upsert corporate profile
    if (!dealId || !legalName || !signerEmail) {
      return Response.json({ error: 'Missing required fields: dealId, legalName, signerEmail' }, { status: 400 });
    }

    const corporateData = {
      corporateId: dealId,
      legalName,
      signerEmail,
      hubspotQuoteUrl: hubspotQuoteUrl || '',
      pricingTier: pricingTier || 'Standard',
      customMarkupPercentage: customMarkupPercentage || null,
      customPerTxFee: customPerTxFee || null,
      applicationStatus: 'Incomplete'
    };

    // Check if profile already exists (idempotent upsert)
    const existingProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: dealId });

    let profileId;
    if (existingProfiles && existingProfiles.length > 0) {
      const existing = existingProfiles[0];
      // Only update non-status fields to avoid overwriting progress
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(existing.id, {
        legalName,
        signerEmail,
        hubspotQuoteUrl: hubspotQuoteUrl || existing.hubspotQuoteUrl,
        pricingTier: pricingTier || existing.pricingTier,
        customMarkupPercentage: customMarkupPercentage ?? existing.customMarkupPercentage,
        customPerTxFee: customPerTxFee ?? existing.customPerTxFee
      });
      profileId = existing.id;
    } else {
      const created = await base44.asServiceRole.entities.MerchantCorporateProfile.create(corporateData);
      profileId = created.id;

      // Auto-create a synthetic legal entity for HubSpot-sourced deals
      const entityId = (`ent-${dealId}`).slice(0, 60);
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(created.id, {
        legalEntities: [{ entityId, legalBusinessName: legalName, federalEIN: dealId && dealId.length >= 9 ? dealId : (legalName) }]
      });
    }

    // Loop through locations and upsert each
    const locationResults = [];
    for (const loc of locations) {
      const { dbaName, businessAddress } = loc;
      if (!dbaName || !businessAddress) continue;

      // Check if location already exists for this corporateId + dbaName
      const existingLocs = await base44.asServiceRole.entities.MerchantLocations.filter({
        corporateId: dealId,
        dbaName
      });

      if (existingLocs && existingLocs.length > 0) {
        const patch = { businessAddress };
        if (!existingLocs[0].entityId) patch.entityId = `ent-${dealId}`;
        await base44.asServiceRole.entities.MerchantLocations.update(existingLocs[0].id, patch);
        locationResults.push({ dbaName, action: 'updated' });
      } else {
        await base44.asServiceRole.entities.MerchantLocations.create({
          corporateId: dealId,
          dbaName,
          businessAddress,
          entityId: `ent-${dealId}`,
          applicationStepStatus: 'In Review'
        });
        locationResults.push({ dbaName, action: 'created' });
      }
    }

    return Response.json({
      success: true,
      corporateId: dealId,
      locationsProcessed: locationResults.length,
      locations: locationResults
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});