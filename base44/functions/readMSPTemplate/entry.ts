import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin-only: requires a Base44 workspace session. Merchant portal tokens
    // are deliberately NOT accepted here.
    let adminUser: any = null;
    try { adminUser = await base44.auth.me(); } catch { /* no session */ }
    if (!adminUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { templateNo = 6 } = body;

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    const headers = {
      'X-API-KEY': apiKey,
      'X-App-ID': appId,
      'Accept': 'application/json',
    };

    const res = await fetch(`${mspBase}/applications/${templateNo}`, { headers });
    const data = await res.json();

    return Response.json({ status: res.status, ok: res.ok, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});