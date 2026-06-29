import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { applicationNo } = body;

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    const headers = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json' };

    if (!applicationNo) {
      // Just check env
      return Response.json({
        mspBase,
        appId,
        apiKeySet: !!apiKey,
        apiKeyPrefix: apiKey ? apiKey.slice(0, 6) + '...' : 'NOT_SET',
      });
    }

    const { testPayload } = body;

    // If testPayload provided, do a PUT and return the raw response
    if (testPayload) {
      const putRes = await fetch(`${mspBase}/applications/${applicationNo}/form`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });
      const putData = await putRes.json();
      return Response.json({
        putStatus: putRes.status,
        canSave: putData.canSave,
        percent_complete: putData.percent_complete,
        data_errors: putData.validation?.errors?.data || putData.data_errors || [],
        completion_errors: putData.validation?.errors?.completion || putData.completion_errors || [],
        rule_violations: putData.validation?.errors?.rules || putData.rule_violations || [],
        messages: putData.messages || [],
        rawResponse: putData,
      });
    }

    // Fetch raw form GET for the given application
    const formRes = await fetch(`${mspBase}/applications/${applicationNo}/form`, { headers });
    const formData = await formRes.json();

    // Extract which fields are currently set vs empty from the form
    const formFields = formData.form || {};
    const emptyFields = Object.entries(formFields).filter(([, v]) => v === null || v === '' || v === undefined).map(([k]) => k);

    return Response.json({
      percent_complete: formData.percent_complete,
      canSave: formData.canSave,
      completion_errors: formData.completion_errors || [],
      data_errors: formData.data_errors || [],
      rule_violations: formData.rule_violations || [],
      empty_fields: emptyFields,
      current_form_values: formFields,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});