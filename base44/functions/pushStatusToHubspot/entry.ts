import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── pushStatusToHubspot ──────────────────────────────────────────────────────
// Syncs onboarding milestones from Base44 → HubSpot deal stage.
// All stage IDs match those created by setupHubspotPipeline.
//
// POST /functions/pushStatusToHubspot
// Body: { corporateId, milestone }
//
// Milestones and their HubSpot stage mappings:
//   link_sent           → onboarding_link_sent       (Onboarding Link Sent)
//   link_opened         → onboarding_link_opened      (Onboarding Link Opened)
//   agreement_filled    → merchant_agreement_filled   (Merchant Agreement Filled)
//   agreement_signed    → merchant_agreement_signed   (Merchant Agreement Signed)
//   locations_added     → locations_added             (Locations Added)
//   application_submitted → application_submitted     (Application Submitted)
//   closed_won          → closedwon                  (Closed Won and Installed)
//   closed_lost         → closedlost                 (Closed Lost)
//
// Banking verified is intentionally NOT a stage transition.

const MILESTONE_TO_STAGE: Record<string, string> = {
  'link_sent':              'onboarding_link_sent',
  'link_opened':            'onboarding_link_opened',
  'agreement_filled':       'merchant_agreement_filled',
  'agreement_signed':       'merchant_agreement_signed',
  'locations_added':        'locations_added',
  'application_submitted':  'application_submitted',
  'closed_won':             'closedwon',
  'closed_lost':            'closedlost',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { corporateId, milestone } = body;

    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
    if (!milestone)   return Response.json({ error: 'milestone required' }, { status: 400 });

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const dealStage = MILESTONE_TO_STAGE[milestone];
    if (!dealStage) {
      return Response.json({
        success: true,
        synced: false,
        reason: `No HubSpot stage mapped for milestone "${milestone}". Valid milestones: ${Object.keys(MILESTONE_TO_STAGE).join(', ')}`,
      });
    }

    const headers = {
      'Authorization': `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
    };

    const patchBody: Record<string, any> = { dealstage: dealStage };

    // Set close date when deal is won
    if (milestone === 'closed_won' || milestone === 'application_submitted') {
      patchBody.closedate = new Date().toISOString().split('T')[0];
    }

    const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${corporateId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ properties: patchBody }),
    });

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 404) {
        // Self-serve application with no HubSpot deal — not an error
        return Response.json({
          success: true,
          synced: false,
          reason: 'Deal not found in HubSpot (self-serve application)',
        });
      }
      return Response.json({
        success: false,
        error: `HubSpot PATCH failed: ${res.status} — ${err.slice(0, 200)}`,
      }, { status: 500 });
    }

    console.log(`[pushStatusToHubspot] deal=${corporateId} → stage=${dealStage} (${milestone})`);

    return Response.json({
      success: true,
      synced: true,
      corporateId,
      milestone,
      hubspotStage: dealStage,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
