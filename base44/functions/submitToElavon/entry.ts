import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Hardcoded constants — never exposed to frontend
const PROFILE_CODE = "PAPI_USA_CLIQBUX1";
const REFERRER_NAME = "PAPI_USA_CLIQBUX";
const CLIENT_ID = "PAHCLIQBUX";

function buildPricingBlock(tier, profile = {}) {
  if (tier === 'Standard') {
    return { pricingModel: 'FLAT_RATE', discountRate: 2.60, transactionFee: 0.10 };
  }
  if (tier === 'Premium') {
    return { pricingModel: 'INTERCHANGE_PLUS', markupPercentage: 0.20, transactionFee: 0.10 };
  }
  if (tier === 'Custom') {
    return { pricingModel: 'INTERCHANGE_PLUS', markupPercentage: profile.customMarkupPercentage || 0, transactionFee: profile.customPerTxFee || 0 };
  }
  if (tier === 'TRADITIONAL') {
    return {
      pricingModel: 'FLAT_RATE',
      feeSchedules: [{ type: 'CARD_PRESENT', discountRate: 2.49, transactionFee: 0.10 }, { type: 'CARD_NOT_PRESENT', discountRate: 2.89, transactionFee: 0.30 }]
    };
  }
  if (tier === 'CASH_DISCOUNT') {
    return { pricingModel: 'CASH_DISCOUNT', discountRate: 0, transactionFee: 0, cashDiscountProgram: true, cashDiscountRate: 3.99 };
  }
  return { pricingModel: 'FLAT_RATE', discountRate: 2.60, transactionFee: 0.10 };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    const allLocs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });
    if (!allLocs || allLocs.length === 0) {
      return Response.json({ error: 'No locations found for this corporate profile' }, { status: 404 });
    }

    const elavonEndpoint = Deno.env.get('ELAVON_ENDPOINT') || 'https://uat-buynow-na.elavon.net/api/v1/eboarding';
    const elavonUsername = Deno.env.get('ELAVON_USERNAME');
    const elavonPassword = Deno.env.get('ELAVON_PASSWORD');
    const basicAuth = btoa(`${elavonUsername}:${elavonPassword}`);

    const pricingBlock = buildPricingBlock(profile.pricingTier, profile);
    const entities = (profile.legalEntities || []).length > 0 ? profile.legalEntities : [{ legalBusinessName: profile.legalName, federalEIN: profile.corporateId }];
    const allResults = [];
    let allSuccessful = true;

    for (const entity of entities) {
      let entityId = entity.entityId;
      // Legacy or single-entity profiles use the fallback identifier
      if (!entityId) entityId = corporateId;

      // Get locations belonging to this entity
      const entityLocs = allLocs.filter(l => (l.entityId === entityId) || (!l.entityId));

      const taxIdDigits = (entity.federalEIN || profile.taxId || corporateId).replace(/\D/g, '');
      const formattedEIN = taxIdDigits.length >= 9 ? `${taxIdDigits.slice(0, 2)}-${taxIdDigits.slice(2, 9)}` : taxIdDigits;
      const clientGroupNumber = taxIdDigits.slice(-3) || '000';

      // Build signing group per entity — each EIN is its own contract
      const signingGroupId = `SG-${corporateId}-${entityId}-${Date.now()}`;

      // Build per-entity submission payload with its own taxId (EIN)
      const entityPayload = {
        profileCode: PROFILE_CODE,
        referrerName: REFERRER_NAME,
        clientId: CLIENT_ID,

        // Each EIN = its own Elavon contract → separate MID
        legalName: entity.legalBusinessName || profile.legalName,
        taxId: formattedEIN,
        signerEmail: profile.signerEmail,
        signerFirstName: profile.firstName || '',
        signerLastName: profile.lastName || '',
        signerDob: profile.dobYear && profile.dobMonth && profile.dobDay
          ? `${profile.dobYear}-${String(profile.dobMonth).padStart(2, '0')}-${String(profile.dobDay).padStart(2, '0')}`
          : '',
        signerSsn: profile.ssn || '',
        signerHomeAddress: {
          street: profile.homeStreet || '',
          city: profile.homeCity || '',
          state: profile.homeState || '',
          zip: profile.homeZip || ''
        },

        signingGroup: { groupId: signingGroupId, totalLocations: entityLocs.length },
        ...pricingBlock
      };

      let anySentInEntity = false;

      for (const location of entityLocs) {
        if (location.applicationStepStatus === 'Approved' && entityLocs.length === 1) {
          // Already signed and no other locations need this entity token
          continue;
        }

        const routingNumber = location.bankDetails?.routingNumber || location.routingNumber || '';
        const accountNumber = location.bankDetails?.accountNumber || location.accountNumber || '';

        if (!routingNumber || !accountNumber) {
          allResults.push({ locationId: location.id, dbaName: location.dbaName, entity: entity.legalBusinessName, status: 'incomplete', error: `Missing routing or account on "${location.dbaName}"` });
          continue;
        }

        anySentInEntity = true;
        const sitePayload = { ...entityPayload, dbaName: location.dbaName, businessAddress: location.businessAddress, routingNumber, accountNumber, accountType: (location.bankDetails?.accountType === 'savings' ? 'SAVINGS' : 'CHECKING') };

        // 📦 DEBUG: outbound packet
        console.log(`[submitToElavon] Entity "${entity.legalBusinessName}" (EIN: ${formattedEIN}) location "${location.dbaName}"`, JSON.stringify(sitePayload, null, 2));

        try {
          const response = await fetch(elavonEndpoint, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(sitePayload)
          });

          const responseText = await response.text();
          let responseData = {};
          try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

          if (response.ok) {
            const elavonMID = responseData?.merchantId || responseData?.mid || responseData?.MID || responseData?.scarecrowId || null;
            await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
              applicationStepStatus: 'Approved',
              elavonMID
            });
            allResults.push({ locationId: location.id, dbaName: location.dbaName, entity: entity.legalBusinessName, status: 'success', elavonMID, httpStatus: response.status });
          } else {
            // 🚨 DEBUG: captured error response
            console.log(`[submitToElavon] ERROR entity "${entity.legalBusinessName}" location "${location.dbaName}" status ${response.status}`, JSON.stringify(responseData || { raw: responseText.slice(0, 2000) }, null, 2));
            await base44.asServiceRole.entities.MerchantLocations.update(location.id, { applicationStepStatus: 'Error' });
            allResults.push({ locationId: location.id, dbaName: location.dbaName, entity: entity.legalBusinessName, status: 'error', error: responseData?.message || responseData?.error || `HTTP ${response.status}`, httpStatus: response.status });
            allSuccessful = false;
          }
        } catch (fetchError) {
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, { applicationStepStatus: 'Error' });
          allResults.push({ locationId: location.id, dbaName: location.dbaName, entity: entity.legalBusinessName, status: 'error', error: fetchError.message });
          allSuccessful = false;
        }
      }

      if (!anySentInEntity) {
        // Nothing needed a boarding call — OK, just log
        console.log(`[submitToElavon] Entity "${entity.legalBusinessName}" — no locations required boarding (all skipped)`);
      }
    }

    if (allSuccessful) {
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, {
        applicationStatus: 'Submitted'
      });
    }

    return Response.json({
      success: allSuccessful,
      corporateId,
      allSubmitted: allSuccessful,
      pricingTier: profile.pricingTier,
      entitiesCount: entities.length,
      results: allResults
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});