import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Hardcoded constants — never exposed to frontend
const PROFILE_CODE = "PAPI_USA_CLIQBUX1";
const REFERRER_NAME = "PAPI_USA_CLIQBUX";
const CLIENT_ID = "PAHCLIQBUX";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { corporateId, locationIds } = body; // locationIds optional — if provided, only submit those

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    // Fetch corporate profile (with sensitive fields)
    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    // Fetch all locations for this corporate
    let locations = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });
    if (!locations || locations.length === 0) {
      return Response.json({ error: 'No locations found for this corporate profile' }, { status: 404 });
    }

    // If specific locationIds provided (retry mode), filter to those only
    if (locationIds && locationIds.length > 0) {
      locations = locations.filter(l => locationIds.includes(l.id));
    }

    const elavonEndpoint = Deno.env.get('ELAVON_ENDPOINT') || 'https://uat-buynow-na.elavon.net/api/v1/eboarding';
    const elavonUsername = Deno.env.get('ELAVON_USERNAME') || 'cliqbuxapiuser@service';
    const elavonPassword = Deno.env.get('ELAVON_PASSWORD') || 'Bal1n3s37#IT6IOgO6T54EZIEZEZ';
    const basicAuth = btoa(`${elavonUsername}:${elavonPassword}`);

    const results = [];
    let allSuccessful = true;

    for (const location of locations) {
      // Skip already approved locations (idempotent retry)
      if (location.applicationStepStatus === 'Approved' && !locationIds) {
        results.push({
          locationId: location.id,
          dbaName: location.dbaName,
          status: 'skipped',
          elavonMID: location.elavonMID
        });
        continue;
      }

      if (!location.routingNumber || !location.accountNumber) {
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

      // Construct Elavon payload
      const elavonPayload = {
        profileCode: PROFILE_CODE,
        referrerName: REFERRER_NAME,
        clientId: CLIENT_ID,
        legalName: profile.legalName,
        taxId: profile.taxId || '',
        signerEmail: profile.signerEmail,
        pricingTier: profile.pricingTier,
        customMarkupPercentage: profile.customMarkupPercentage,
        customPerTxFee: profile.customPerTxFee,
        dbaName: location.dbaName,
        businessAddress: location.businessAddress,
        routingNumber: location.routingNumber,
        accountNumber: location.accountNumber
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
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = { raw: responseText };
        }

        if (response.ok) {
          const elavonMID = responseData?.merchantId || responseData?.mid || responseData?.MID || null;
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Approved',
            elavonMID: elavonMID
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
          break; // Halt on failure
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

    // If all locations succeeded, update master applicationStatus
    if (allSuccessful) {
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, {
        applicationStatus: 'Submitted'
      });
    }

    return Response.json({
      success: allSuccessful,
      corporateId,
      allSubmitted: allSuccessful,
      results
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});