import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const appId = Deno.env.get('MSP_APP_ID');
    const appKey = Deno.env.get('MSP_APP_KEY');

    if (!appId || !appKey) {
      return Response.json({ error: 'MSP_APP_ID or MSP_APP_KEY not set' }, { status: 500 });
    }

    // Try common schema/metadata endpoints
    const endpoints = [
      'https://api.mspapi.com/schema',
      'https://api.mspapi.com/v1/schema',
      'https://api.mspapi.com/merchant/schema',
      'https://api.mspapi.com/v1/merchant/schema',
      'https://api.mspapi.com/boarding/schema',
      'https://api.mspapi.com/v1/boarding/schema',
      'https://api.mspapi.com/application/schema',
      'https://api.mspapi.com/v1/application/schema',
    ];

    const results = {};
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: {
            'appid': appId,
            'appkey': appKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }
        });
        results[url] = { status: res.status, body: await res.text() };
      } catch (err) {
        results[url] = { error: err.message };
      }
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});