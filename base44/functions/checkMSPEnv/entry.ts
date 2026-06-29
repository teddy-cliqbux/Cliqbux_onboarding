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

    // Fetch raw form GET for the given application
    const formRes = await fetch(`${mspBase}/applications/${applicationNo}/form`, { headers });
    const formData = await formRes.json();

    // Also fetch POST /signatures to see why it fails
    const sigRes = await fetch(`${mspBase}/applications/${applicationNo}/signatures`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendEmail: false }),
    });
    const sigData = await sigRes.json();

    return Response.json({
      form: {
        status: formRes.status,
        percent_complete: formData.percent_complete,
        canSave: formData.canSave,
        data_errors: formData.data_errors,
        completion_errors: formData.completion_errors,
        rule_violations: formData.rule_violations,
        full: formData,
      },
      signatures: {
        status: sigRes.status,
        data: sigData,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});