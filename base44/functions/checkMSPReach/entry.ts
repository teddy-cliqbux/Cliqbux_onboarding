import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin-only: test reachability of both MSP URLs
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const headers = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json' };

    const urls = [
      `${Deno.env.get('MSP_BASE_URL') || ''}`,
      'https://api.msppulsepoint.com/v2',
    ];

    const results = {};
    for (const url of urls) {
      if (!url) continue;
      try {
        const res = await fetch(`${url.replace(/\/$/, '')}/applications?limit=10`, { headers });
        const body = await res.text();
        results[url] = { status: res.status, ok: res.ok, snippet: body.slice(0, 150) };
      } catch (err) {
        results[url] = { error: err.message };
      }
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});