import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Cliqbux Partner Constants ────────────────────────────────────────────────
const PROFILE_CODE = "PAPI_USA_CLIQBUX1";

// ─── Main ─────────────────────────────────────────────────────────────────────
// Called by a scheduled job (or manually) to poll Elavon /boardstatus for all
// locations in 'Pending MID' state. When Elavon returns COMPLETE, stores the
// MID and transitions the location to 'Active'.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const elavonBase = (Deno.env.get('ELAVON_ENDPOINT') || 'https://uat-buynow-na.elavon.net').replace(/\/api\/.*$/, '');
    const auth = btoa(`${Deno.env.get('ELAVON_USERNAME')}:${Deno.env.get('ELAVON_PASSWORD')}`);

    // Find all locations awaiting MID assignment
    const pendingLocations = await base44.asServiceRole.entities.MerchantLocations.filter({
      applicationStepStatus: 'Pending MID'
    });

    if (!pendingLocations?.length) {
      return Response.json({ success: true, message: 'No pending locations', checked: 0 });
    }

    console.log(`[pollBoardingStatus] Checking ${pendingLocations.length} pending location(s)`);

    const results = [];

    for (const location of pendingLocations) {
      const awb = location.awb || location.boardingId;
      if (!awb) {
        results.push({ locationId: location.id, dbaName: location.dbaName, result: 'skipped', reason: 'No AWB stored' });
        continue;
      }

      try {
        // Elavon boardstatus endpoint — GET with AWB as query param
        const statusUrl = `${elavonBase}/api/v4/boardstatus?awb=${encodeURIComponent(awb)}&profileCode=${encodeURIComponent(PROFILE_CODE)}`;
        const res = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
        });

        const resText = await res.text();
        let resData = {};
        try { resData = JSON.parse(resText); } catch { resData = { raw: resText.slice(0, 500) }; }

        console.log(`[pollBoardingStatus] AWB ${awb} status ${res.status}:`, JSON.stringify(resData));

        if (!res.ok) {
          results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'error', httpStatus: res.status, details: resData });
          continue;
        }

        // Elavon boardstatus response fields:
        // status: "PENDING" | "IN_PROGRESS" | "COMPLETE" | "DECLINED" | "ERROR"
        // merchantId / mid: assigned once COMPLETE
        const boardStatus = (resData?.status || resData?.payloadStatus || resData?.applicationStatus || '').toUpperCase();
        const elavonMID = resData?.merchantId || resData?.mid || resData?.MID || resData?.merchantNumber || null;

        if (boardStatus === 'COMPLETE') {
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Active',
            elavonMID,
          });
          console.log(`[pollBoardingStatus] Location ${location.id} (${location.dbaName}) activated — MID: ${elavonMID}`);
          results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'activated', elavonMID, boardStatus });
        } else if (boardStatus === 'DECLINED' || boardStatus === 'ERROR') {
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Error',
          });
          results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'declined', boardStatus });
        } else {
          results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'still_pending', boardStatus });
        }
      } catch (locErr) {
        results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'exception', error: locErr.message });
      }
    }

    return Response.json({ success: true, checked: pendingLocations.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});