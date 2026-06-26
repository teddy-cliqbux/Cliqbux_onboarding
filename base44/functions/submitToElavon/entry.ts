import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Hardcoded constants — never exposed to frontend
const PROFILE_CODE = "PAPI_USA_CLIQBUX1";
const REFERRER_NAME = "PAPI_USA_CLIQBUX";
const CLIENT_ID = "PAHCLIQBUX";

function buildPricingBlock(profile) {
  const tier = profile.pricingTier;

  if (tier === 'Standard') {
    return {
      pricingModel: 'FLAT_RATE',
      discountRate: 2.60,
      transactionFee: 0.10
    };
  }
  if (tier === 'Premium') {
    return {
      pricingModel: 'INTERCHANGE_PLUS',
      markupPercentage: 0.20,
      transactionFee: 0.10
    };
  }
  if (tier === 'Custom') {
    return {
      pricingModel: 'INTERCHANGE_PLUS',
      markupPercentage: profile.customMarkupPercentage || 0,
      transactionFee: profile.customPerTxFee || 0
    };
  }
  // TRADITIONAL: single account with both card-present and card-not-present fee schedules
  if (tier === 'TRADITIONAL') {
    return {
      pricingModel: 'FLAT_RATE',
      feeSchedules: [
        {
          type: 'CARD_PRESENT',
          discountRate: 2.49,
          transactionFee: 0.10
        },
        {
          type: 'CARD_NOT_PRESENT',
          discountRate: 2.89,
          transactionFee: 0.30
        }
      ]
    };
  }
  if (tier === 'CASH_DISCOUNT') {
    return {
      pricingModel: 'CASH_DISCOUNT',
      discountRate: 0,
      transactionFee: 0,
      cashDiscountProgram: true,
      cashDiscountRate: 3.99
    };
  }

  // Fallback
  return {
    pricingModel: 'FLAT_RATE',
    discountRate: 2.60,
    transactionFee: 0.10
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { corporateId, locationIds } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    let locations = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });
    if (!locations || locations.length === 0) {
      return Response.json({ error: 'No locations found for this corporate profile' }, { status: 404 });
    }

    if (locationIds && locationIds.length > 0) {
      locations = locations.filter(l => locationIds.includes(l.id));
    }

    const elavonEndpoint = Deno.env.get('ELAVON_ENDPOINT') || 'https://uat-buynow-na.elavon.net/api/v1/eboarding';
    const elavonUsername = Deno.env.get('ELAVON_USERNAME');
    const elavonPassword = Deno.env.get('ELAVON_PASSWORD');
    const basicAuth = btoa(`${elavonUsername}:${elavonPassword}`);

    const pricingBlock = buildPricingBlock(profile);
    const results = [];
    let allSuccessful = true;

    // Build signing group to wrap all locations in one submission batch
    const signingGroupId = `SG-${corporateId}-${Date.now()}`;

    for (const location of locations) {
      if (location.applicationStepStatus === 'Approved' && !locationIds) {
        results.push({
          locationId: location.id,
          dbaName: location.dbaName,
          status: 'skipped',
          elavonMID: location.elavonMID
        });
        continue;
      }

      const routingNumber = location.bankDetails?.routingNumber || location.routingNumber || '';
      const accountNumber = location.bankDetails?.accountNumber || location.accountNumber || '';

      if (!routingNumber || !accountNumber) {
        await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
          applicationStepStatus: 'Error'
        });
        results.push({
          locationId: location.id,
          dbaName: location.dbaName,
          status: 'error',
          error: 'Missing routing or account number'
        });
        allSuccessful = false;
        break;
      }

      const elavonPayload = {
        // Static integration constants
        profileCode: PROFILE_CODE,
        referrerName: REFERRER_NAME,
        clientId: CLIENT_ID,

        // Signing group — wraps all locations in one batch
        signingGroup: {
          groupId: signingGroupId,
          totalLocations: locations.length
        },

        // Corporate identity
        legalName: profile.legalName,
        taxId: profile.taxId || '',
        signerEmail: profile.signerEmail,
        signerFirstName: profile.firstName || '',
        signerLastName: profile.lastName || '',
        signerDob: profile.dobYear && profile.dobMonth && profile.dobDay
          ? `${profile.dobYear}-${String(profile.dobMonth).padStart(2,'0')}-${String(profile.dobDay).padStart(2,'0')}`
          : '',
        signerSsn: profile.ssn || '',
        signerHomeAddress: {
          street: profile.homeStreet || '',
          city: profile.homeCity || '',
          state: profile.homeState || '',
          zip: profile.homeZip || ''
        },

        // Location-specific
        dbaName: location.dbaName,
        businessAddress: location.businessAddress,

        // Banking
        routingNumber,
        accountNumber,

        // Pricing — dynamically set per tier
        ...pricingBlock
      };

      try {
        const response = await fetch(elavonEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(elavonPayload)
        });

        const responseText = await response.text();
        let responseData = {};
        try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

        if (response.ok) {
          const elavonMID = responseData?.merchantId || responseData?.mid || responseData?.MID || null;
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Approved',
            elavonMID
          });
          results.push({
            locationId: location.id,
            dbaName: location.dbaName,
            status: 'success',
            elavonMID,
            httpStatus: response.status
          });
        } else {
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Error'
          });
          results.push({
            locationId: location.id,
            dbaName: location.dbaName,
            status: 'error',
            error: responseData?.message || responseData?.error || `HTTP ${response.status}`,
            httpStatus: response.status
          });
          allSuccessful = false;
          break;
        }
      } catch (fetchError) {
        await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
          applicationStepStatus: 'Error'
        });
        results.push({
          locationId: location.id,
          dbaName: location.dbaName,
          status: 'error',
          error: fetchError.message
        });
        allSuccessful = false;
        break;
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
      pricingBlock,
      results
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});