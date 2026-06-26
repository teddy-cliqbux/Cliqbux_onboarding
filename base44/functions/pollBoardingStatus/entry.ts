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
        // Per Elavon docs: GET /api/v4/boardstatus?awb={awb}&profileCode={profileCode}
        const statusUrl = `${elavonBase}/api/v4/boardstatus?awb=${encodeURIComponent(awb)}&profileCode=${encodeURIComponent(PROFILE_CODE)}`;
        const res = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
          },
        });

        const resText = await res.text();
        let resData: Record<string, unknown> = {};
        try { resData = JSON.parse(resText); } catch { resData = { raw: resText.slice(0, 500) }; }

        console.log(`[pollBoardingStatus] AWB ${awb} status ${res.status}:`, JSON.stringify(resData));

        if (!res.ok) {
          results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'error', httpStatus: res.status, details: resData });
          continue;
        }

        // Elavon boardstatus response fields:
        // status: "PENDING" | "IN_PROGRESS" | "COMPLETE" | "DECLINED" | "ERROR"
        // merchantId / mid: assigned once COMPLETE
        const boardStatus = (resData?.status || resData?.payloadStatus || resData?.applicationStatus || '') as string;
        const upperStatus = boardStatus.toUpperCase();

        if (upperStatus === 'COMPLETE') {
          const elavonMID = resData?.merchantId || resData?.mid || resData?.MID || resData?.merchantNumber || null;
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Active',
            elavonMID,
          });
          results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'activated', elavonMID, boardStatus });

        } else if (upperStatus === 'DECLINED' || upperStatus === 'ERROR') {
          await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
            applicationStepStatus: 'Error',
          });
          results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'declined', boardStatus, details: resData });

        } else {
          // Still pending — leave as-is
          results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'still_pending', boardStatus });
        }

      } catch (err) {
        results.push({ locationId: location.id, dbaName: location.dbaName, awb, result: 'error', error: err.message });
      }
    }

    const activated = results.filter(r => r.result === 'activated').length;
    const stillPending = results.filter(r => r.result === 'still_pending').length;

    return Response.json({ success: true, checked: pendingLocations.length, activated, stillPending, results });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});
