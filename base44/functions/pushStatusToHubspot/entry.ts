// createClientFromRequest imported for future enrichment steps that need asServiceRole
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── pushStatusToHubspot ──────────────────────────────────────────────────────
// Syncs onboarding milestones from Base44 → HubSpot deal stage.
// All stage IDs match those created by setupHubspotPipeline.
//
// POST /functions/pushStatusToHubspot
// Body: { corporateId, milestone }
//
// Milestones and their HubSpot stage mappings:
//   link_sent              → onboarding_link_sent       (Onboarding Link Sent)
//   link_opened            → onboarding_link_opened     (Portal Opened)
//   agreement_filled       → merchant_agreement_filled  (Forms In Progress)
//   agreement_signed       → merchant_agreement_signed  (Quote & Agreement Executed)
//   locations_added        → locations_added            (Structure & MIDs Configured)
//   application_submitted  → application_submitted      (Submitted to Underwriting)
//   ready_for_deployment   → ready_for_deployment        (Ready for Deployment / Fulfillment)
//   closed_won             → closedwon                  (Closed Won and Installed — Cliqbux Merchant Pipeline)
//   closed_lost            → closedlost                 (Closed Lost — Cliqbux Merchant Pipeline)
//
// The first seven milestones live in the dedicated "Merchant Onboarding" pipeline
// (id below — must match whatever setupHubspotPipeline actually created; HubSpot
// may not honor a requested custom pipeline ID). Every PATCH for those milestones
// also sets `pipeline` so the deal moves in immediately, since HubSpot requires a
// deal's dealstage to belong to its current pipeline — sending it every time is
// idempotent and avoids needing to track "is this the first milestone" state.
//
// closed_won / closed_lost intentionally act on whatever pipeline the deal is
// currently in (unchanged behavior) — they are not part of the onboarding pipeline.
//
// Banking verified is intentionally NOT a stage transition.

const ONBOARDING_PIPELINE_ID = '2400387772'; // real HubSpot-assigned ID for "Merchant Onboarding" — HubSpot did not honor the requested custom slug

const ONBOARDING_MILESTONES = new Set([
  'link_sent', 'link_opened', 'agreement_filled', 'agreement_signed',
  'locations_added', 'application_submitted', 'ready_for_deployment',
]);

const MILESTONE_TO_STAGE: Record<string, string> = {
 'link_sent': 'Onboarding Link Sent',
  'link_opened': 'Portal Opened',
  'agreement_filled': 'Forms In Progress',
  'agreement_signed': 'Quote & Agreement Executed',
  'locations_added': 'Structure & MIDs Configured',
  'application_submitted': 'Submitted to Underwriting',
  'ready_for_deployment': 'Ready for Deployment / Fulfillment',
  'closed_won': 'Closed Won',
  'closed_lost': 'Closed Lost',
};

Deno.serve(async (req) => {
  try {
    // No auth.me() check — this function is called fire-and-forget from the
    // magic-link portal where auth.me() returns null. Security is the
    // HUBSPOT_API_KEY env var; no Base44 entity access happens here.

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

    // Onboarding milestones live in the dedicated pipeline — move the deal in
    // on every onboarding PATCH (idempotent; HubSpot requires dealstage to
    // belong to the deal's current pipeline or the PATCH is rejected).
    if (ONBOARDING_MILESTONES.has(milestone)) {
      patchBody.pipeline = ONBOARDING_PIPELINE_ID;
    }

    // Set close date when the deal reaches its terminal/won state
    if (milestone === 'closed_won' || milestone === 'ready_for_deployment') {
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
