import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Elavon Webhook Receiver ──────────────────────────────────────────────────
// Structured to receive POST notifications from Elavon once Cliqbux's endpoint
// is whitelisted in the Elavon partner portal.
//
// Elavon will POST a payload containing the AWB and updated boarding status.
// When status = COMPLETE, we extract the MID and transition the location to 'Active'.
//
// Expected payload shape (Elavon standard):
// {
//   awb: string,
//   payloadStatus: "COMPLETE" | "DECLINED" | "PENDING" | ...,
//   merchantId?: string,   // present when payloadStatus = COMPLETE
//   mid?: string,
//   profileCode?: string,
// }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Accept GET for health check / endpoint verification by Elavon
    if (req.method === 'GET') {
      return new Response('Elavon webhook endpoint active', { status: 200 });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    let payload = {};
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    console.log('[elavonWebhook] Received payload:', JSON.stringify(payload));

    // Extract AWB and status — Elavon may use different field names
    const awb = payload?.awb || payload?.applicationId || payload?.boardingId;
    const boardStatus = ((payload?.payloadStatus || payload?.status || payload?.applicationStatus || '')).toUpperCase();
    const elavonMID = payload?.merchantId || payload?.mid || payload?.MID || payload?.merchantNumber || null;

    if (!awb) {
      console.warn('[elavonWebhook] No AWB in payload — cannot match location');
      return Response.json({ received: true, warning: 'No AWB in payload' }, { status: 200 });
    }

    // Find the matching location by AWB
    const locations = await base44.asServiceRole.entities.MerchantLocations.filter({ awb });
    const location = locations?.[0];

    if (!location) {
      console.warn(`[elavonWebhook] No location found for AWB ${awb}`);
      return Response.json({ received: true, warning: `No location matched AWB ${awb}` }, { status: 200 });
    }

    if (boardStatus === 'COMPLETE') {
      await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
        applicationStepStatus: 'Active',
        elavonMID,
      });
      console.log(`[elavonWebhook] Location ${location.id} (${location.dbaName}) activated — MID: ${elavonMID}`);
      return Response.json({ received: true, result: 'activated', locationId: location.id, elavonMID });
    } else if (boardStatus === 'DECLINED' || boardStatus === 'ERROR') {
      await base44.asServiceRole.entities.MerchantLocations.update(location.id, {
        applicationStepStatus: 'Error',
      });
      console.log(`[elavonWebhook] Location ${location.id} (${location.dbaName}) declined — status: ${boardStatus}`);
      return Response.json({ received: true, result: 'declined', locationId: location.id, boardStatus });
    } else {
      console.log(`[elavonWebhook] Location ${location.id} still pending — status: ${boardStatus}`);
      return Response.json({ received: true, result: 'no_change', locationId: location.id, boardStatus });
    }
  } catch (error) {
    console.error('[elavonWebhook] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});