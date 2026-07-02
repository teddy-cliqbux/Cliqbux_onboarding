import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── setupHubspotPipeline ─────────────────────────────────────────────────────
// One-time admin function: provisions a distinct "Merchant Onboarding" deal
// pipeline in HubSpot (separate from "Cliqbux Merchant Pipeline"), with the
// exact internal stage tokens pushStatusToHubspot expects.
//
// Safe to run multiple times — idempotent. If the pipeline already exists,
// only missing stages are added (matched by internal stage ID).
//
// POST /functions/setupHubspotPipeline
// Body: {} (uses HUBSPOT_API_KEY env var)
//
// Stages created, in order:
//   onboarding_link_sent        — Onboarding Link Sent
//   onboarding_link_opened      — Portal Opened
//   merchant_agreement_filled   — Forms In Progress
//   merchant_agreement_signed   — Quote & Agreement Executed
//   locations_added             — Structure & MIDs Configured
//   application_submitted       — Submitted to Underwriting
//   ready_for_deployment        — Ready for Deployment / Fulfillment  (terminal / won)

const PIPELINE_LABEL = 'Merchant Onboarding';
const PIPELINE_ID = 'merchant_onboarding'; // requested internal ID; HubSpot may assign its own if taken

const STAGES = [
  { id: 'onboarding_link_sent',        label: 'Onboarding Link Sent',              probability: 0.10, isClosed: false },
  { id: 'onboarding_link_opened',      label: 'Portal Opened',                     probability: 0.25, isClosed: false },
  { id: 'merchant_agreement_filled',   label: 'Forms In Progress',                 probability: 0.40, isClosed: false },
  { id: 'merchant_agreement_signed',   label: 'Quote & Agreement Executed',        probability: 0.55, isClosed: false },
  { id: 'locations_added',             label: 'Structure & MIDs Configured',       probability: 0.70, isClosed: false },
  { id: 'application_submitted',       label: 'Submitted to Underwriting',         probability: 0.85, isClosed: false },
  { id: 'ready_for_deployment',        label: 'Ready for Deployment / Fulfillment', probability: 1.00, isClosed: true },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized — admin role required' }, { status: 403 });
    }

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const headers = {
      'Authorization': `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
    };

    // ── 1. List existing pipelines, look for one already matching by id or label ──
    const listRes = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', { headers });
    if (!listRes.ok) {
      const err = await listRes.text();
      return Response.json({ error: `Failed to list pipelines: ${listRes.status} — ${err.slice(0, 300)}` }, { status: 500 });
    }
    const { results: allPipelines } = await listRes.json();
    const existingPipeline = (allPipelines || []).find(
      (p: any) => p.id === PIPELINE_ID || (p.label || '').toLowerCase() === PIPELINE_LABEL.toLowerCase()
    );

    let pipelineId: string;
    let pipelineWasCreated = false;
    const stageResults: Array<{ id: string; label: string; status: string; error?: string }> = [];

    if (!existingPipeline) {
      // ── 2a. Pipeline doesn't exist — create it with all stages in one call ──
      const createRes = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          label: PIPELINE_LABEL,
          displayOrder: 10,
          stages: STAGES.map((s, i) => ({
            id: s.id,
            label: s.label,
            displayOrder: i,
            metadata: { probability: String(s.probability), isClosed: String(s.isClosed) },
          })),
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        return Response.json({ error: `Failed to create pipeline: ${createRes.status} — ${err.slice(0, 300)}` }, { status: 500 });
      }

      const created = await createRes.json();
      pipelineId = created.id;
      pipelineWasCreated = true;
      for (const s of STAGES) stageResults.push({ id: s.id, label: s.label, status: 'created' });

      console.log(`[setupHubspotPipeline] Created pipeline "${PIPELINE_LABEL}" (id=${pipelineId}) with ${STAGES.length} stages`);

    } else {
      // ── 2b. Pipeline exists — verify/add any missing stages ──
      pipelineId = existingPipeline.id;
      const existingStages: any[] = existingPipeline.stages || [];
      const existingIds = new Set(existingStages.map((s: any) => s.id));
      const maxOrder = existingStages.reduce((m: number, s: any) => Math.max(m, s.displayOrder ?? 0), 0);

      let nextOrder = maxOrder + 1;
      for (const stage of STAGES) {
        if (existingIds.has(stage.id)) {
          stageResults.push({ id: stage.id, label: stage.label, status: 'already_exists' });
          continue;
        }
        try {
          const res = await fetch(`https://api.hubapi.com/crm/v3/pipelines/deals/${pipelineId}/stages`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              id: stage.id,
              label: stage.label,
              displayOrder: nextOrder++,
              metadata: { probability: String(stage.probability), isClosed: String(stage.isClosed) },
            }),
          });
          if (res.ok) {
            stageResults.push({ id: stage.id, label: stage.label, status: 'created' });
            console.log(`[setupHubspotPipeline] Added missing stage "${stage.label}" to existing pipeline ${pipelineId}`);
          } else {
            const err = await res.text();
            stageResults.push({ id: stage.id, label: stage.label, status: 'error', error: `${res.status}: ${err.slice(0, 200)}` });
          }
        } catch (e: any) {
          stageResults.push({ id: stage.id, label: stage.label, status: 'error', error: e.message });
        }
      }
    }

    const created  = stageResults.filter(r => r.status === 'created').length;
    const existing = stageResults.filter(r => r.status === 'already_exists').length;
    const errors   = stageResults.filter(r => r.status === 'error').length;

    return Response.json({
      success: errors === 0,
      pipelineId,
      pipelineLabel: PIPELINE_LABEL,
      pipelineWasCreated,
      summary: `${created} stage(s) created, ${existing} already existed, ${errors} errors`,
      stages: stageResults,
      note: 'pushStatusToHubspot must also PATCH the deal\'s "pipeline" property to this pipelineId on the first onboarding milestone — it currently only sets dealstage, which requires the deal already be in this pipeline.',
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
