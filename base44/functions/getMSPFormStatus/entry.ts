import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Returns the MSPWare form completion status for a specific application number.
// Used by the signing error guide to surface missing fields to the merchant.
// POST /functions/getMSPFormStatus
// Body: { corporateId, applicationNo }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // base44.auth.me() throws (rather than resolving to null) when there is no
    // logged-in staff session — which is the normal case for self-serve merchants
    // using the magic-link portal. Treat that as "no user" instead of letting it
    // crash the function (previously caused a 500 here, masking the real MSPWare
    // validation errors this endpoint exists to surface).
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch (_e) {
      user = null;
    }

    const body = await req.json();
    const { corporateId, applicationNo } = body;
    if (!applicationNo) return Response.json({ error: 'applicationNo required' }, { status: 400 });

    // Verify the application belongs to this merchant (or user is admin).
    // Self-serve merchants have no `user` at all, so they must prove ownership
    // via corporateId; staff/admin sessions skip this check.
    if (user?.role !== 'admin') {
      if (!corporateId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const profile = profiles?.[0];
      if (!profile) return Response.json({ error: 'Merchant not found' }, { status: 404 });
      // Verify the application number is associated with this merchant's merchantMIDs
      const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId });
      const owned = (merchantMIDs || []).some((c: any) => String(c.mspApplicationNo) === String(applicationNo));
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

    // Also try to create signatures package to get the blocking error
    let signaturesError = null;
    const sigRes = await fetch(`${mspBase}/applications/${applicationNo}/signatures`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendEmail: false }),
    });
    if (!sigRes.ok || !(await sigRes.clone().json().then((d: any) => d.success).catch(() => false))) {
      const sigData = await sigRes.json().catch(() => ({})) as any;
      signaturesError = sigData?.error || sigData?.message || `HTTP ${sigRes.status}`;
    }

    return Response.json({
      success: formRes.ok,
      percent_complete: formData.percent_complete ?? null,
      canSave: formData.canSave ?? false,
      canSubmit: formData.canSubmit ?? null,
      completion_errors: formData.completion_errors || [],
      data_errors:       formData.data_errors       || [],
      rule_violations:   formData.rule_violations   || [],
      errors:            formData.errors            || [],
      signaturesError,
      // Full raw form for debugging — includes all fields currently on the application
      rawForm: formData.form || formData,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});