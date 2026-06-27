import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Quick MSPWare portfolio check — admin-only diagnostic
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    const headers = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json' };

    const listRes = await fetch(`${mspBase}/applications?limit=200`, { headers });
    const listData = await listRes.json();
    const apps = listData?.applications || [];

    const byStatus = {};
    apps.forEach(a => {
      const s = a.application_status || 'unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });

    const withMID = apps.filter(a => a.mid);
    const approvedWithMID = apps.filter(a => ['Approved', 'Complete'].includes(a.application_status) && a.mid);

    return Response.json({
      success: listRes.ok,
      statusCode: listRes.status,
      mspBase,
      totalApplications: apps.length,
      byStatus,
      withMID: withMID.length,
      approvedWithMID: approvedWithMID.length,
      sampleApproved: approvedWithMID.slice(0, 5).map(a => ({
        appNo: a.merchantapplicationno,
        dba: a.dba,
        mid: a.mid,
        created: a.created_on,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});