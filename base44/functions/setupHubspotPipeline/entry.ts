import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── setupHubspotPipeline ─────────────────────────────────────────────────────
// One-time admin function: adds onboarding progress stages to the Cliqbux
// Merchant Pipeline in HubSpot.
//
// Safe to run multiple times — existing stages are skipped (matched by label).
//
// POST /functions/setupHubspotPipeline
// Body: {} (uses HUBSPOT_API_KEY env var)
//
// New stages added (in order, after "Quote Signed", before "Closed Won"):
//   onboarding_link_sent       — Onboarding Link Sent
//   onboarding_link_opened     — Onboarding Link Opened
//   merchant_agreement_filled  — Merchant Agreement Filled
//   merchant_agreement_signed  — Merchant Agreement Signed
//   locations_added            — Locations Added
//   application_submitted      — Application Submitted

const PIPELINE_ID = 'default'; // Cliqbux Merchant Pipeline

// The new stages to create, with their internal IDs.
// displayOrder is set relative to existing stages at runtime.
const NEW_STAGES = [
  { id: 'onboarding_link_sent',      label: 'Onboarding Link Sent',      probability: 0.5 },
  { id: 'onboarding_link_opened',    label: 'Onboarding Link Opened',    probability: 0.55 },
  { id: 'merchant_agreement_filled', label: 'Merchant Agreement Filled', probability: 0.6 },
  { id: 'merchant_agreement_signed', label: 'Merchant Agreement Signed', probability: 0.65 },
  { id: 'locations_added',           label: 'Locations Added',           probability: 0.7 },
  { id: 'application_submitted',     label: 'Application Submitted',     probability: 0.85 },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const headers = {
      'Authorization': `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
    };

    // ── 1. Fetch current pipeline to find existing stages ─────────────────────
    const pipelineRes = await fetch(
      `https://api.hubapi.com/crm/v3/pipelines/deals/${PIPELINE_ID}`,
      { headers }
    );
    if (!pipelineRes.ok) {
      const err = await pipelineRes.text();
      return Response.json({ error: `Failed to fetch pipeline: ${pipelineRes.status} — ${err}` }, { status: 500 });
    }

    const pipeline = await pipelineRes.json();
    const existingStages: any[] = pipeline.stages || [];
    const existingLabels = new Set(existingStages.map((s: any) => s.label?.toLowerCase()));
    const existingIds    = new Set(existingStages.map((s: any) => s.id));

    // Find the display order of "Quote Signed" (stage_0) — insert after it
    const quoteSignedStage = existingStages.find((s: any) => s.id === 'stage_0');
    const closedWonStage   = existingStages.find((s: any) => s.id === 'closedwon');
    const insertAfterOrder = quoteSignedStage?.displayOrder ?? 90;
    const closedWonOrder   = closedWonStage?.displayOrder   ?? 200;

    console.log(`[setupHubspotPipeline] Existing stages: ${existingStages.length}, inserting after order ${insertAfterOrder}`);

    // ── 2. Create new stages ──────────────────────────────────────────────────
    const results: Array<{ id: string; label: string; status: string; error?: string }> = [];

    // Space new stages evenly between Quote Signed and Closed Won
    const gap = Math.floor((closedWonOrder - insertAfterOrder) / (NEW_STAGES.length + 1));

    for (let i = 0; i < NEW_STAGES.length; i++) {
      const stage = NEW_STAGES[i];
      const displayOrder = insertAfterOrder + gap * (i + 1);

      // Skip if already exists by ID or label
      if (existingIds.has(stage.id) || existingLabels.has(stage.label.toLowerCase())) {
        results.push({ id: stage.id, label: stage.label, status: 'already_exists' });
        console.log(`[setupHubspotPipeline] Already exists: ${stage.label}`);
        continue;
      }

      try {
        const res = await fetch(
          `https://api.hubapi.com/crm/v3/pipelines/deals/${PIPELINE_ID}/stages`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              id:           stage.id,
              label:        stage.label,
              displayOrder,
              metadata: { probability: String(stage.probability), isClosed: 'false' },
            }),
          }
        );

        if (res.ok) {
          const created = await res.json();
          results.push({ id: created.id, label: stage.label, status: 'created' });
          console.log(`[setupHubspotPipeline] Created: ${stage.label} (id=${created.id}, order=${displayOrder})`);
        } else {
          const err = await res.text();
          results.push({ id: stage.id, label: stage.label, status: 'error', error: `${res.status}: ${err.slice(0, 200)}` });
          console.error(`[setupHubspotPipeline] Error creating "${stage.label}":`, res.status, err.slice(0, 200));
        }
      } catch (e: any) {
        results.push({ id: stage.id, label: stage.label, status: 'error', error: e.message });
      }
    }

    const created  = results.filter(r => r.status === 'created').length;
    const existing = results.filter(r => r.status === 'already_exists').length;
    const errors   = results.filter(r => r.status === 'error').length;

    return Response.json({
      success: errors === 0,
      summary: `${created} created, ${existing} already existed, ${errors} errors`,
      results,
      note: 'Run pushStatusToHubspot with these stage IDs to advance deals through onboarding.',
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
