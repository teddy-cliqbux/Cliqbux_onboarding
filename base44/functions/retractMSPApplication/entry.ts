import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── retractMSPApplication ────────────────────────────────────────────────────
// ADMIN ONLY. Voids a MID's MSPWare draft application and resets the record
// so the merchant can re-edit and re-submit.
//
// Use this when:
//   - Merchant needs to change data after the signing draft was created
//   - A signing session failed and needs to be restarted from scratch
//   - A test/dummy application was accidentally submitted to MSPWare
//
// NOT visible to merchants. Call from the admin back-office only.
//
// POST /functions/retractMSPApplication
// Body: { merchantIDId }
//
// What it does:
//   1. Fetches the MerchantProcessingConcept record
//   2. Calls DELETE /applications/{mspApplicationNo} on MSPWare (best-effort)
//   3. Resets applicationStepStatus → 'Ready to Submit'
//   4. Clears mspApplicationNo so signApplication will create a fresh draft
//   5. Returns what happened (MSPWare void result + our DB reset)

const MSP_BASE = 'https://api.msppulsepoint.com/v2';

function getMspHeaders() {
  const apiKey = Deno.env.get('MSP_APP_KEY');
  const appId  = Deno.env.get('MSP_APP_ID') || 'cliqbux';
  if (!apiKey) throw new Error('MSP_APP_KEY is not set');
  return { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Content-Type': 'application/json' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin auth — must be a logged-in Base44 user (not a portal magic-link session)
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized — admin login required' }, { status: 401 });
    }

    const body = await req.json();
    const { merchantIDId } = body;

    if (!merchantIDId) {
      return Response.json({ error: 'merchantIDId required' }, { status: 400 });
    }

    // 1. Fetch the concept record
    const concept = await base44.asServiceRole.entities.MerchantProcessingConcept.get(merchantIDId);
    if (!concept) {
      return Response.json({ error: 'MerchantProcessingConcept not found' }, { status: 404 });
    }

    const { mspApplicationNo, dbaName, applicationStepStatus } = concept;

    const result: Record<string, any> = {
      merchantIDId,
      dbaName,
      previousStatus: applicationStepStatus,
      mspApplicationNo: mspApplicationNo || null,
    };

    // 2. Void in MSPWare (best-effort — if the app doesn't exist there, we still reset our record)
    if (mspApplicationNo) {
      try {
        const mspHeaders = getMspHeaders();

        // Try DELETE first
        const deleteRes = await fetch(`${MSP_BASE}/applications/${mspApplicationNo}`, {
          method: 'DELETE',
          headers: mspHeaders,
        });

        if (deleteRes.ok || deleteRes.status === 404) {
          result.mspVoidStatus = deleteRes.ok ? 'voided' : 'not_found_in_msp';
          result.mspVoidCode = deleteRes.status;
        } else {
          // DELETE failed — try a status update to 'Cancelled' as fallback
          const body404 = await deleteRes.text();
          console.warn(`[retractMSPApplication] DELETE returned ${deleteRes.status}: ${body404.slice(0, 200)}`);

          const cancelRes = await fetch(`${MSP_BASE}/applications/${mspApplicationNo}`, {
            method: 'PATCH',
            headers: mspHeaders,
            body: JSON.stringify({ status: 'Cancelled' }),
          });
          result.mspVoidStatus = cancelRes.ok ? 'cancelled_via_patch' : 'msp_void_failed';
          result.mspVoidCode = cancelRes.ok ? cancelRes.status : deleteRes.status;
          result.mspVoidNote = cancelRes.ok
            ? 'Cancelled via PATCH (DELETE not supported)'
            : `Could not void in MSPWare — reset locally only. MSP error: ${body404.slice(0, 100)}`;
        }
      } catch (mspErr: any) {
        // MSPWare unreachable — still reset our record
        result.mspVoidStatus = 'msp_unreachable';
        result.mspVoidNote = mspErr.message;
        console.warn(`[retractMSPApplication] MSPWare void failed: ${mspErr.message}`);
      }
    } else {
      result.mspVoidStatus = 'skipped_no_application_no';
    }

    // 3. Reset our record regardless of MSPWare result
    await base44.asServiceRole.entities.MerchantProcessingConcept.update(merchantIDId, {
      applicationStepStatus: 'Ready to Submit',
      mspApplicationNo:       null,
    });

    result.newStatus = 'Ready to Submit';
    result.success   = true;
    result.message   = `"${dbaName}" retracted. Merchant can now re-edit and re-submit.`;

    console.log(`[retractMSPApplication] ${dbaName} (${merchantIDId}) retracted by ${user.email || user.id}. MSP void: ${result.mspVoidStatus}`);

    return Response.json(result);

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});