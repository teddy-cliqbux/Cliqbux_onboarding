import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── pushStatusToHubspot ──────────────────────────────────────────────────────
// Syncs onboarding progress from Base44 → HubSpot deal stage.
// Called whenever a merchant hits a key milestone in the portal.
//
// POST /functions/pushStatusToHubspot
// Body: { corporateId, applicationStatus }
//
// Stage mapping (Cliqbux Merchant Pipeline):
//   'Incomplete'         → stage_0   (Quote Signed — portal opened)
//   'Quote Signed'       → stage_0   (Quote Signed)
//   'Pricing Selected'   → stage_0   (Quote Signed)
//   'Banking Submitted'  → contractsent  (Proposal Scheduled — banking verified)
//   'Banking Complete'   → contractsent
//   'Submitted'          → closedwon (Closed Won and Installed)
//   'Approved'           → closedwon
//   'Declined'           → closedlost

// HubSpot deal stage IDs (Cliqbux Merchant Pipeline)
const STATUS_TO_STAGE: Record<string, string> = {
  'Incomplete':        'stage_0',        // Quote Signed
  'Pricing Selected':  'stage_0',        // Quote Signed
  'Quote Signed':      'stage_0',        // Quote Signed
  'Banking Submitted': 'contractsent',   // Proposal Scheduled (banking verified)
  'Banking Complete':  'contractsent',   // Proposal Scheduled
  'Submitted':         'closedwon',      // Closed Won and Installed
  'Approved':          'closedwon',      // Closed Won and Installed
  'Declined':          'closedlost',     // Closed Lost
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { corporateId, applicationStatus } = body;

    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
    if (!applicationStatus) return Response.json({ error: 'applicationStatus required' }, { status: 400 });

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const dealStage = STATUS_TO_STAGE[applicationStatus];
    if (!dealStage) {
      // Unknown status — nothing to sync, not an error
      return Response.json({
        success: true,
        synced: false,
        reason: `No HubSpot stage mapping for status "${applicationStatus}"`,
      });
    }

    const headers = {
      'Authorization': `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
    };

    const patchBody: Record<string, any> = { dealstage: dealStage };

    // For submitted deals, also set close date to today
    if (applicationStatus === 'Submitted' || applicationStatus === 'Approved') {
      patchBody.closedate = new Date().toISOString().split('T')[0];
    }

    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${corporateId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ properties: patchBody }),
    });

    if (!res.ok) {
      const err = await res.text();
      // 404 = deal not in HubSpot (e.g. self-serve) — not fatal
      if (res.status === 404) {
        return Response.json({ success: true, synced: false, reason: 'Deal not found in HubSpot (self-serve application)' });
      }
      return Response.json({
        success: false,
        error: `HubSpot PATCH failed: ${res.status} — ${err.slice(0, 200)}`,
      }, { status: 500 });
    }

    console.log(`[pushStatusToHubspot] deal=${corporateId} → stage=${dealStage} (${applicationStatus})`);

    return Response.json({
      success: true,
      synced: true,
      corporateId,
      applicationStatus,
      hubspotStage: dealStage,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
