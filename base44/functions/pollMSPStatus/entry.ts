import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── MSPWare Boarding Status Poller ──────────────────────────────────────────
// Polls GET /applications/{mspApplicationNo}/status for all pending records in
// both MerchantLocations (legacy) and MerchantMID (new).
// When MSPWare reports Approved/Complete, extracts the MID and transitions
// the record to Active.
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

    // ── Collect pending records from both entities ────────────────────────────
    // Legacy: MerchantLocations with Pending MID
    // New: MerchantMID with Pending MID
    const [pendingLocations, pendingMerchantMIDs] = await Promise.all([
      base44.asServiceRole.entities.MerchantLocations.filter({ applicationStepStatus: 'Pending MID' }),
      base44.asServiceRole.entities.MerchantMID
        ? base44.asServiceRole.entities.MerchantMID.filter({ applicationStepStatus: 'Pending MID' })
        : Promise.resolve([]),
    ]);

    // Normalise into a single work queue: { id, dbaName, mspApplicationNo, entityType }
    const queue = [
      ...(pendingLocations || []).map((l: any) => ({
        id: l.id, dbaName: l.dbaName, mspApplicationNo: l.mspApplicationNo, entityType: 'location',
      })),
      ...(pendingMerchantMIDs || []).map((c: any) => ({
        id: c.id, dbaName: c.dbaName, mspApplicationNo: c.mspApplicationNo, entityType: 'merchantMID',
      })),
    ];

    if (!queue.length) {
      return Response.json({ success: true, message: 'No pending records', checked: 0 });
    }

    console.log(`[pollMSPStatus] Checking ${queue.length} pending record(s) (${pendingLocations?.length ?? 0} locations, ${pendingMerchantMIDs?.length ?? 0} merchantMIDs)`);

    const results: any[] = [];

    for (const record of queue) {
      const { id, dbaName, mspApplicationNo, entityType } = record;

      if (!mspApplicationNo) {
        results.push({ id, dbaName, entityType, result: 'skipped', reason: 'No mspApplicationNo stored' });
        continue;
      }

      try {
        const statusRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/status`, { headers: mspHeaders });
        const statusData = await statusRes.json();

        console.log(`[pollMSPStatus] App ${mspApplicationNo} (${entityType}) status ${statusRes.status}:`, JSON.stringify(statusData));

        if (!statusRes.ok) {
          results.push({ id, dbaName, entityType, mspApplicationNo, result: 'error', httpStatus: statusRes.status, details: statusData });
          continue;
        }

        const currentState = (statusData?.currentState || '').toUpperCase();
        const entity = entityType === 'merchantMID'
          ? base44.asServiceRole.entities.MerchantMID
          : base44.asServiceRole.entities.MerchantLocations;

        if (currentState === 'APPROVED' || currentState === 'COMPLETE') {
          // Fetch full application to extract the assigned MID
          const appRes = await fetch(`${mspBase}/applications/${mspApplicationNo}`, { headers: mspHeaders });
          const appData = await appRes.json();
          const elavonMID = appData?.application?.merchant_id
            || appData?.application?.elavon_mid
            || appData?.application?.mid
            || appData?.mid
            || String(appData?.applications?.[0]?.mid || '')
            || null;

          await entity.update(id, {
            applicationStepStatus: 'Active',
            elavonMID,
          });
          console.log(`[pollMSPStatus] ${entityType} ${id} (${dbaName}) activated — MID: ${elavonMID}`);
          results.push({ id, dbaName, entityType, mspApplicationNo, result: 'activated', elavonMID, currentState });

        } else if (['DECLINED', 'RETURNED', 'PROCESSORRETURNED', 'PROCESSORRETURN', 'ERROR'].includes(currentState)) {
          await entity.update(id, { applicationStepStatus: 'Error' });
          console.log(`[pollMSPStatus] ${entityType} ${id} (${dbaName}) declined — state: ${currentState}`);
          results.push({ id, dbaName, entityType, mspApplicationNo, result: 'declined', currentState, details: statusData });

        } else {
          results.push({ id, dbaName, entityType, mspApplicationNo, result: 'still_pending', currentState });
        }

      } catch (err: any) {
        results.push({ id, dbaName, entityType, mspApplicationNo, result: 'error', error: err.message });
      }
    }

    const activated    = results.filter(r => r.result === 'activated').length;
    const declined     = results.filter(r => r.result === 'declined').length;
    const stillPending = results.filter(r => r.result === 'still_pending').length;

    return Response.json({
      success: true,
      checked: queue.length,
      activated,
      declined,
      stillPending,
      results,
    });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});
