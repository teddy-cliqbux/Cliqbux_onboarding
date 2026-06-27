import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── MSPWare Boarding Status Poller ──────────────────────────────────────────
// Polls GET /applications/{mspApplicationNo}/status for all locations in
// 'Pending MID' state. When MSPWare reports 'Approved', extracts the MID and
// transitions the location to 'Active'.
//
// Call this on a schedule (e.g. every 10 minutes) or invoke manually.
// MSPWare submit is async — can take up to 4 minutes per their docs.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Accept': 'application/json',
    };

    // Find all locations awaiting MID assignment
    const pendingLocations = await base44.asServiceRole.entities.MerchantLocations.filter({
      applicationStepStatus: 'Pending MID',
    });

    if (!pendingLocations?.length) {
      return Response.json({ success: true, message: 'No pending locations', checked: 0 });
    }

    console.log(`[pollMSPStatus] Checking ${pendingLocations.length} pending location(s)`);

    const results = [];

    for (const location of pendingLocations) {
      const mspApplicationNo = location.mspApplicationNo;

      if (!mspApplicationNo) {
        results.push({ locationId: location.id, dbaName: location.dbaName, result: 'skipped', reason: 'No mspApplicationNo stored' });
        continue;
      }

      try {
        const statusRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/status`, {
          headers: mspHeaders,
        });
        const statusData = await statusRes.json();

        console.log(`[pollMSPStatus] App ${mspApplicationNo} status ${statusRes.status}:`, JSON.stringify(statusData));

        if (!statusRes.ok) {
          results.push({ locationId: location.id, dbaName: location.dbaName, mspApplicationNo, result: 'error', httpStatus: statusRes.status, details: statusData });
          continue;
        }

        // MSPWare status response: { currentState, promoteState, demoteState, ... }
        const currentState = (statusData?.currentState || '').toUpperCase();

        if (currentState === 'APPROVED' || currentState === 'COMPLETE') {
          // Fetch full application to get the assigned MID
          const appRes = await fetch(`${mspBase}/applications/${mspApplicationNo}`, { headers: mspHeaders });
          const appData = await appRes.json();
          const elavonMID = appData?.application?.merchant_id
            || appData?.application?.elavon_mid
            || appData?.application?.mid
            || appData?.merchant_id
            || null;

          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Active',
            elavonMID,
          });
          console.log(`[pollMSPStatus] Location ${location.id} (${location.dbaName}) activated — MID: ${elavonMID}`);
          results.push({ locationId: location.id, dbaName: location.dbaName, mspApplicationNo, result: 'activated', elavonMID, currentState });

        } else if (['DECLINED', 'RETURNED', 'PROCESSORRETURNED', 'PROCESSORRETURN', 'ERROR'].includes(currentState)) {
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Error',
          });
          console.log(`[pollMSPStatus] Location ${location.id} (${location.dbaName}) declined — state: ${currentState}`);
          results.push({ locationId: location.id, dbaName: location.dbaName, mspApplicationNo, result: 'declined', currentState, details: statusData });

        } else {
          // Still in progress (PENDING, IN_PROGRESS, SUBMITTED, etc.)
          results.push({ locationId: location.id, dbaName: location.dbaName, mspApplicationNo, result: 'still_pending', currentState });
        }

      } catch (err) {
        results.push({ locationId: location.id, dbaName: location.dbaName, mspApplicationNo, result: 'error', error: err.message });
      }
    }

    const activated    = results.filter(r => r.result === 'activated').length;
    const declined     = results.filter(r => r.result === 'declined').length;
    const stillPending = results.filter(r => r.result === 'still_pending').length;

    return Response.json({ success: true, checked: pendingLocations.length, activated, declined, stillPending, results });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});
