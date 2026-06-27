import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Admin-only: dump MSP connectivity config
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const mspBaseRaw = Deno.env.get('MSP_BASE_URL') || '';
    const apiKeySet = !!Deno.env.get('MSP_APP_KEY');
    const appId = Deno.env.get('MSP_APP_ID') || '';
    const salespersonId = Deno.env.get('MSP_SALESPERSON_ID') || '';

    return Response.json({
      mspBaseRaw,
      mspBaseNormalized: mspBaseRaw.replace(/\/$/, ''),
      apiKeyLength: apiKeySet ? Deno.env.get('MSP_APP_KEY').length : 0,
      appId,
      salespersonId,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});