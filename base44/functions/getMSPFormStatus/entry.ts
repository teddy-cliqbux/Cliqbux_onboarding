import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns the MSPWare form completion status for a specific application number.
// Used by the signing error guide to surface missing fields to the merchant.
// POST /functions/getMSPFormStatus
// Body: { corporateId, applicationNo }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { corporateId, applicationNo } = body;
    if (!applicationNo) return Response.json({ error: 'applicationNo required' }, { status: 400 });

    // Verify the application belongs to this merchant (or user is admin)
    if (corporateId && user.role !== 'admin') {
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const profile = profiles?.[0];
      if (!profile) return Response.json({ error: 'Merchant not found' }, { status: 404 });
      // Verify the application number is associated with this merchant's concepts
      const concepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({ corporateId });
      const owned = (concepts || []).some((c: any) => String(c.mspApplicationNo) === String(applicationNo));
      if (!owned) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY not set' }, { status: 500 });

    const headers = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Accept':    'application/json',
    };

    const formRes = await fetch(`${mspBase}/applications/${applicationNo}/form`, { headers });
    const formData = await formRes.json();

    return Response.json({
      success: formRes.ok,
      percent_complete: formData.percent_complete ?? null,
      canSave: formData.canSave ?? false,
      completion_errors: formData.completion_errors || [],
      data_errors:       formData.data_errors       || [],
      rule_violations:   formData.rule_violations   || [],
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});