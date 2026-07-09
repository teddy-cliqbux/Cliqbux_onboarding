import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Debug: returns the raw full form GET response for an MSPWare application
// POST /functions/debugMSPForm  { applicationNo: "161" }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin-only: requires a Base44 workspace session. Merchant portal tokens
    // are deliberately NOT accepted here.
    let adminUser: any = null;
    try { adminUser = await base44.auth.me(); } catch { /* no session */ }
    if (!adminUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { applicationNo } = body;
    if (!applicationNo) return Response.json({ error: 'applicationNo required' }, { status: 400 });

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    const headers = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json' };

    const res = await fetch(`${mspBase}/applications/${applicationNo}/form`, { headers });
    const data = await res.json();

    // Pull out fields that are null, empty string, or false (potentially unfilled)
    const emptyFields: string[] = [];
    const scan = (obj: any, prefix = '') => {
      for (const [k, v] of Object.entries(obj || {})) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v === null || v === '' || v === false) {
          emptyFields.push(`${path}=${JSON.stringify(v)}`);
        } else if (typeof v === 'object' && !Array.isArray(v)) {
          scan(v, path);
        }
      }
    };
    scan(data);

    // Also pull all form field keys and their values for a flat view
    const flatForm: Record<string, any> = {};
    const flatten = (obj: any, prefix = '') => {
      for (const [k, v] of Object.entries(obj || {})) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (Array.isArray(v)) {
          flatForm[path] = `[array len=${v.length}]`;
        } else if (typeof v === 'object' && v !== null) {
          flatten(v, path);
        } else {
          flatForm[path] = v;
        }
      }
    };
    flatten(data.form || {});

    // Fields that are null, empty, or 0 (could be the missing 1%)
    const suspectFields = Object.entries(flatForm)
      .filter(([, v]) => v === null || v === '' || v === 0 || v === '0' || v === false)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`);

    return Response.json({
      status: res.status,
      percent_complete: data.percent_complete,
      canSave: data.canSave,
      completion_errors: data.completion_errors || [],
      data_errors: data.data_errors || [],
      rule_violations: data.rule_violations || [],
      suspectFields,
      allFormFields: flatForm,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});