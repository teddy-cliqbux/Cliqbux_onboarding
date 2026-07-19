import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── MSPWare Boarding Status Poller ──────────────────────────────────────────
// Polls GET /applications/{mspApplicationNo}/status for all pending records in
// both MerchantLocations (legacy) and MerchantMID (new).
// When MSPWare reports Approved/Complete, extracts the MID and transitions
// the record to Active.
//
// Also extracts Elavon AWB whenever present (pre-screen / underwriting) and
// writes MerchantMID.elavonAwb — Deal Room status inquiries need it.
//
// Call this on a schedule (e.g. every 10 minutes) or invoke manually.
// MSPWare submit is async — can take up to 4 minutes per their docs.
// Auto-approve can complete in ~15 minutes; otherwise the app goes to underwriting.

// --- BEGIN extractElavonAwb (sync with helpers/extractElavonAwb.ts) ---
function extractElavonAwb(...payloads: unknown[]): string | null {
  for (const payload of payloads) {
    const found = walkForAwb(payload, 0);
    if (found) return found;
  }
  return null;
}
const AWB_KEY_RE = /^(awb|elavon_?awb|application_?work_?basket|work_?basket(_?id|_?no|_?number)?|boarding_?id|processor_?(ref|reference|application_?id)|elavon_?(ref|reference|app(lication)?_?id))$/i;
function walkForAwb(node: unknown, depth: number): string | null {
  if (node == null || depth > 8) return null;
  if (typeof node === 'string' || typeof node === 'number') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const f = walkForAwb(item, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (AWB_KEY_RE.test(k) && (typeof v === 'string' || typeof v === 'number')) {
      const s = String(v).trim();
      if (s && s.length >= 4 && s.length <= 32) return s;
    }
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') {
      const m = v.match(/\bAWB\s*[:#]?\s*([A-Z0-9-]{4,24})\b/i);
      if (m?.[1]) return m[1];
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const f = walkForAwb(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}
// --- END extractElavonAwb ---

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

        // Always try to capture AWB while pending / on approve (needed for ApplicationStatus@)
        let appData: any = null;
        try {
          const appRes = await fetch(`${mspBase}/applications/${mspApplicationNo}`, { headers: mspHeaders });
          if (appRes.ok) appData = await appRes.json();
        } catch { /* non-fatal */ }

        const elavonAwb = extractElavonAwb(statusData, appData, appData?.application);
        if (elavonAwb && entityType === 'merchantMID') {
          try {
            await entity.update(id, { elavonAwb });
            console.log(`[pollMSPStatus] ${entityType} ${id} AWB captured: ${elavonAwb}`);
          } catch (e: any) {
            console.warn(`[pollMSPStatus] AWB persist failed:`, e?.message);
          }
        }

        if (currentState === 'APPROVED' || currentState === 'COMPLETE') {
          if (!appData) {
            const appRes = await fetch(`${mspBase}/applications/${mspApplicationNo}`, { headers: mspHeaders });
            appData = await appRes.json();
          }
          const elavonMID = appData?.application?.merchant_id
            || appData?.application?.elavon_mid
            || appData?.application?.mid
            || appData?.mid
            || String(appData?.applications?.[0]?.mid || '')
            || null;

          const patch: Record<string, unknown> = {
            applicationStepStatus: 'Active',
            elavonMID,
          };
          if (elavonAwb) patch.elavonAwb = elavonAwb;
          await entity.update(id, patch);
          console.log(`[pollMSPStatus] ${entityType} ${id} (${dbaName}) activated — MID: ${elavonMID} AWB: ${elavonAwb || '—'}`);
          results.push({ id, dbaName, entityType, mspApplicationNo, result: 'activated', elavonMID, elavonAwb, currentState });

        } else if (['DECLINED', 'RETURNED', 'PROCESSORRETURNED', 'PROCESSORRETURN', 'ERROR'].includes(currentState)) {
          await entity.update(id, { applicationStepStatus: 'Error' });
          console.log(`[pollMSPStatus] ${entityType} ${id} (${dbaName}) declined — state: ${currentState}`);
          results.push({ id, dbaName, entityType, mspApplicationNo, result: 'declined', currentState, elavonAwb, details: statusData });

        } else {
          results.push({
            id, dbaName, entityType, mspApplicationNo,
            result: 'still_pending',
            currentState,
            elavonAwb: elavonAwb || null,
            note: elavonAwb
              ? 'In pre-screen or underwriting — AWB available for ApplicationStatus@'
              : 'Pending — AWB not yet visible on MSP status/application payload (check field name live)',
          });
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
