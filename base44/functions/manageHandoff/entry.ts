/**
 * manageHandoff — team pipeline: facts, stages, missing views, call transcript inbox.
 *
 * Actions:
 *   get                — profile handoffStage + facts + stageMissing summary
 *   listFacts          — { corporateId, locationId? }
 *   upsertFact         — { corporateId, factKey, value?, status?, locationId?, source?, evidenceRef? }
 *   advanceStage       — { corporateId, toStage?, override?: bool, overrideReason? }
 *   setStage           — admin set any stage { corporateId, handoffStage }
 *   ingestTranscript   — { corporateId, body, callType?, callDate?, locationId?, title? }
 *   listTranscripts    — { corporateId }
 *   acceptSuggestion   — { corporateId, transcriptId, suggestionId, value? }
 *   rejectSuggestion   — { corporateId, transcriptId, suggestionId }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getPortalActor(req: Request, base44: any): Promise<{ actor: 'merchant' | 'admin'; corporateId?: string } | null> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      const ok = await crypto.subtle.verify('HMAC', key, __b64uDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
      if (ok) {
        const payload = JSON.parse(new TextDecoder().decode(__b64uDecode(parts[1])));
        if (payload.corporateId && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000) {
          return { actor: 'merchant', corporateId: String(payload.corporateId) };
        }
      }
    }
  } catch { /* fall through */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no session */ }
  return null;
}

// --- BEGIN onboardingFacts (sync with src/lib/onboardingFacts.js) ---
const HANDOFF_STAGES = ['sales', 'underwriting', 'implementation', 'installation', 'support'];
const HANDOFF_STAGE_LABELS: Record<string, string> = {
  sales: 'Sales', underwriting: 'Underwriting', implementation: 'Implementation',
  installation: 'Installation', support: 'Support',
};
function nextHandoffStage(current: string) {
  const i = HANDOFF_STAGES.indexOf(current);
  if (i < 0 || i >= HANDOFF_STAGES.length - 1) return null;
  return HANDOFF_STAGES[i + 1];
}
function catalogKeyToFactKey(catalogKey: string, autoRule?: string) {
  const key = String(catalogKey || '').toLowerCase();
  const rule = String(autoRule || '').toLowerCase();
  if (rule === 'hours_present' || key.includes('business_hours') || key.includes('verify_business_hours')) return 'business_hours';
  if (rule === 'menu_uploaded' || key.includes('menu_product') || key.includes('confirm_menu')) return 'menu';
  if (rule === 'mid_live' || key.includes('merchant_id_mid') || key.includes('verify_merchant_id')) return 'mid';
  if (rule === 'quote_paid' || key.includes('signed_agreement') || key.includes('agreement_sow')) return 'sow_signed';
  if (rule === 'install_date_set' || key.includes('installation_date')) return 'install_date';
  if (key.includes('store_contact') || key.includes('contact_information')) return 'store_contact';
  if (key.includes('floor_plan')) return 'floor_plan';
  if (key.includes('tax_rate')) return 'tax_rates';
  if (key.includes('employee_list')) return 'employee_list';
  if (key.includes('printer_location')) return 'printer_locations';
  if (key.includes('kitchen_workflow')) return 'kitchen_workflow';
  if (key.includes('internet_provider')) return 'isp';
  if (key.includes('client_sign') || key.includes('obtain_client_sign') || key.includes('sign-off') || key.includes('sign_off')) return 'client_signoff';
  if (key.includes('training_complete') || key.includes('confirm_training')) return 'training_complete';
  return null;
}
const STAGE_FACT_FOCUS: Record<string, string[]> = {
  sales: ['store_contact', 'sow_signed'],
  underwriting: ['mid', 'sow_signed'],
  implementation: ['store_contact', 'business_hours', 'tax_rates', 'menu', 'employee_list', 'floor_plan', 'printer_locations', 'kitchen_workflow', 'isp'],
  installation: ['install_date', 'mid', 'business_hours', 'menu', 'client_signoff'],
  support: ['client_signoff', 'training_complete', 'mid'],
};
const FACT_KEY_LABELS: Record<string, string> = {
  business_hours: 'Business hours', store_contact: 'Store contact', tax_rates: 'Tax rates',
  menu: 'Menu / products', employee_list: 'Employee list', floor_plan: 'Floor plan',
  printer_locations: 'Printer locations', kitchen_workflow: 'Kitchen workflow', isp: 'Internet provider',
  mid: 'Merchant ID (MID)', sow_signed: 'Agreement / SOW', install_date: 'Install date',
  client_signoff: 'Client sign-off', training_complete: 'Training complete',
};
const FACT_TRANSCRIPT_PHRASES: Record<string, string[]> = {
  business_hours: ['hours are', 'open from', 'we open', 'closing at', 'mon-fri', 'monday through'],
  store_contact: ['primary contact', 'reach me at', 'my number', 'cell is', 'email is'],
  tax_rates: ['tax rate', 'sales tax', 'tax percent'],
  menu: ['menu', 'product list', 'items we sell', 'upload the menu'],
  employee_list: ['employees', 'staff list', 'team members', 'who works'],
  floor_plan: ['floor plan', 'layout of the store', 'store layout'],
  printer_locations: ['receipt printer', 'kitchen printer', 'printer by'],
  kitchen_workflow: ['kitchen workflow', 'expo', 'kds', 'ticket to the kitchen'],
  isp: ['internet', 'isp', 'comcast', 'spectrum', 'fiber', 'wifi'],
  mid: ['merchant id', 'mid is', 'elavon mid'],
  install_date: ['install on', 'installation date', 'come out on', 'schedule install'],
  client_signoff: ['signed off', 'we are good to go', 'approved the install'],
  training_complete: ['training done', 'staff trained', 'finished training'],
  sow_signed: ['signed the agreement', 'signed the sow', 'contract signed'],
};
// --- END onboardingFacts ---

function factDedupKey(corporateId: string, factKey: string, locationId?: string) {
  return `${corporateId}|${factKey}|${locationId || ''}`;
}

async function listFacts(base44: any, corporateId: string, locationId?: string) {
  const all = await base44.asServiceRole.entities.MerchantOnboardingFact.filter({ corporateId }) || [];
  if (!locationId) return all;
  return all.filter((f: any) => !f.locationId || String(f.locationId) === String(locationId));
}

async function upsertFact(base44: any, opts: {
  corporateId: string;
  factKey: string;
  value?: string;
  status?: string;
  locationId?: string;
  source?: string;
  evidenceRef?: string;
  gatheredBy?: string;
}) {
  const { corporateId, factKey } = opts;
  if (!corporateId || !factKey) throw new Error('corporateId and factKey required');
  const existing = await listFacts(base44, corporateId, opts.locationId);
  const match = existing.find((f: any) =>
    f.factKey === factKey && String(f.locationId || '') === String(opts.locationId || '')
  );
  const status = opts.status || 'gathered';
  const patch = {
    corporateId,
    factKey,
    locationId: opts.locationId || '',
    value: opts.value != null ? String(opts.value) : (match?.value || ''),
    status,
    source: opts.source || 'agent',
    evidenceRef: opts.evidenceRef || '',
    gatheredAt: new Date().toISOString(),
    gatheredBy: opts.gatheredBy || '',
  };
  if (match) {
    return base44.asServiceRole.entities.MerchantOnboardingFact.update(match.id, patch);
  }
  return base44.asServiceRole.entities.MerchantOnboardingFact.create(patch);
}

function isFactGathered(facts: any[], factKey: string, locationId?: string) {
  return facts.some((f: any) =>
    f.factKey === factKey &&
    (f.status === 'gathered' || f.status === 'verified') &&
    (!locationId || !f.locationId || String(f.locationId) === String(locationId))
  );
}

async function buildStageMissing(base44: any, corporateId: string, stage: string) {
  const facts = await listFacts(base44, corporateId);
  const focus = STAGE_FACT_FOCUS[stage] || [];
  const missingFacts = focus.filter((k) => !isFactGathered(facts, k)).map((k) => ({
    factKey: k,
    label: FACT_KEY_LABELS[k] || k,
  }));
  const gathered = facts
    .filter((f: any) => f.status === 'gathered' || f.status === 'verified')
    .map((f: any) => ({
      factKey: f.factKey,
      label: FACT_KEY_LABELS[f.factKey] || f.factKey,
      value: f.value || '',
      source: f.source,
      locationId: f.locationId || '',
    }));

  let openUwDocs = 0;
  let holdItems = 0;
  let quoteMissing = false;
  let openImplMerchant = 0;
  let openInstallHolds = 0;

  try {
    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
      { corporateId }, '-created_date', 1
    );
    const profile = profiles[0];
    quoteMissing = !profile?.hubspotQuoteUrl && !profile?.equipmentPaidAt;

    const items = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ corporateId }) || [];
    openUwDocs = items.filter((i: any) =>
      (!i.lane || i.lane === 'underwriting') && i.source === 'agent' && i.status === 'open'
    ).length;
    holdItems = items.filter((i: any) => i.lane === 'deployment' && i.status === 'hold').length;
    openImplMerchant = items.filter((i: any) =>
      i.lane === 'deployment' &&
      (i.audience === 'merchant' || i.audience === 'shared') &&
      i.status !== 'completed' && i.status !== 'done'
    ).length;
    openInstallHolds = holdItems;
  } catch { /* entity may be missing */ }

  const blockers: Array<{ code: string; hard: boolean; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (stage === 'underwriting' && openUwDocs > 0) {
    blockers.push({
      code: 'open_agent_docs',
      hard: true,
      message: `${openUwDocs} open document request(s) still need the merchant.`,
    });
  }
  if (stage === 'sales' && quoteMissing) {
    warnings.push({
      code: 'quote_missing',
      message: 'No equipment quote on the deal yet (soft — does not block handoff).',
    });
  }
  if (stage === 'implementation' && missingFacts.length > 0) {
    warnings.push({
      code: 'impl_facts',
      message: `${missingFacts.length} implementation fact(s) still unknown.`,
    });
  }
  if (stage === 'installation' && openInstallHolds > 0) {
    warnings.push({
      code: 'hold_items',
      message: `${openInstallHolds} installation item(s) on Hold.`,
    });
  }
  if (stage === 'implementation' && openImplMerchant > 0) {
    warnings.push({
      code: 'merchant_pack',
      message: `${openImplMerchant} merchant prep item(s) still open.`,
    });
  }

  return {
    stage,
    stageLabel: HANDOFF_STAGE_LABELS[stage] || stage,
    missingFacts,
    gathered,
    openUwDocs,
    holdItems,
    openImplMerchant,
    quoteMissing,
    blockers,
    warnings,
    canAdvanceHard: blockers.filter((b) => b.hard).length === 0,
  };
}

function suggestFromTranscript(body: string, openChecklist: any[]) {
  const lower = body.toLowerCase();
  const suggestions: any[] = [];
  let n = 0;

  for (const [factKey, phrases] of Object.entries(FACT_TRANSCRIPT_PHRASES)) {
    const hit = phrases.find((p) => lower.includes(p));
    if (!hit) continue;
    n += 1;
    const related = openChecklist.find((i: any) => {
      const fk = catalogKeyToFactKey(i.catalogKey || i.kind, i.autoRule);
      return fk === factKey;
    });
    suggestions.push({
      id: `s${n}`,
      kind: related ? 'checklist' : 'fact',
      factKey,
      catalogKey: related?.catalogKey || related?.kind || '',
      checklistItemId: related?.id || '',
      title: related?.title || (FACT_KEY_LABELS[factKey] || factKey),
      suggestedValue: hit,
      matchPhrase: hit,
      status: 'pending',
    });
  }

  // Title keyword match for remaining open deployment items
  for (const item of openChecklist) {
    if (suggestions.some((s) => s.checklistItemId === item.id)) continue;
    const title = String(item.title || '').toLowerCase();
    const words = title.split(/\s+/).filter((w: string) => w.length > 4).slice(0, 4);
    if (words.length >= 2 && words.filter((w: string) => lower.includes(w)).length >= 2) {
      n += 1;
      suggestions.push({
        id: `s${n}`,
        kind: 'checklist',
        factKey: catalogKeyToFactKey(item.catalogKey || item.kind, item.autoRule) || '',
        catalogKey: item.catalogKey || item.kind || '',
        checklistItemId: item.id,
        title: item.title,
        suggestedValue: '',
        matchPhrase: words.slice(0, 2).join(' '),
        status: 'pending',
      });
    }
  }

  return suggestions.slice(0, 25);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'get');
    const corporateId = String(body.corporateId || '').trim();
    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
    if (actor.actor === 'merchant' && actor.corporateId !== corporateId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
      { corporateId }, '-created_date', 1
    );
    const profile = profiles[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    let authorEmail = '';
    if (actor.actor === 'admin') {
      try {
        const me = await base44.auth.me();
        authorEmail = me?.email || '';
      } catch { /* ignore */ }
    }

    if (action === 'get' || action === 'listFacts') {
      const stage = String(profile.handoffStage || (
        profile.applicationStatus === 'Submitted' ? 'underwriting' : 'sales'
      ));
      const facts = await listFacts(base44, corporateId, body.locationId ? String(body.locationId) : undefined);
      const missing = await buildStageMissing(base44, corporateId, stage);
      return Response.json({
        success: true,
        handoffStage: stage,
        stageLabel: HANDOFF_STAGE_LABELS[stage] || stage,
        nextStage: nextHandoffStage(stage),
        stages: HANDOFF_STAGES.map((s) => ({ id: s, label: HANDOFF_STAGE_LABELS[s] })),
        facts,
        ...missing,
      });
    }

    if (action === 'upsertFact') {
      const factKey = String(body.factKey || '').trim();
      if (!factKey) return Response.json({ error: 'factKey required' }, { status: 400 });
      const fact = await upsertFact(base44, {
        corporateId,
        factKey,
        value: body.value,
        status: body.status || 'gathered',
        locationId: body.locationId ? String(body.locationId) : '',
        source: body.source || (actor.actor === 'merchant' ? 'portal' : 'agent'),
        evidenceRef: body.evidenceRef ? String(body.evidenceRef) : '',
        gatheredBy: authorEmail || 'merchant',
      });
      return Response.json({ success: true, fact });
    }

    if (action === 'setStage' || action === 'advanceStage') {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
      const current = String(profile.handoffStage || (
        profile.applicationStatus === 'Submitted' ? 'underwriting' : 'sales'
      ));
      let target = action === 'setStage'
        ? String(body.handoffStage || '').trim()
        : String(body.toStage || nextHandoffStage(current) || '').trim();
      if (!HANDOFF_STAGES.includes(target)) {
        return Response.json({ error: `Invalid stage: ${target}` }, { status: 400 });
      }

      const missing = await buildStageMissing(base44, corporateId, current);
      const hard = missing.blockers.filter((b) => b.hard);
      const override = body.override === true;
      if (hard.length && !override) {
        return Response.json({
          error: 'Cannot advance — blocking items remain.',
          code: 'STAGE_BLOCKED',
          blockers: hard,
          warnings: missing.warnings,
        }, { status: 422 });
      }

      await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, {
        handoffStage: target,
        handoffStageUpdatedAt: new Date().toISOString(),
        handoffStageUpdatedBy: authorEmail,
        ...(override && hard.length ? {
          handoffOverrideReason: String(body.overrideReason || 'Agent override'),
        } : {}),
      });

      return Response.json({
        success: true,
        handoffStage: target,
        stageLabel: HANDOFF_STAGE_LABELS[target],
        warnings: missing.warnings,
        overridden: override && hard.length > 0,
      });
    }

    if (action === 'ingestTranscript') {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
      const text = String(body.body || '').trim();
      if (!text) return Response.json({ error: 'body required' }, { status: 400 });

      let openChecklist: any[] = [];
      try {
        const items = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ corporateId }) || [];
        openChecklist = items.filter((i: any) =>
          i.status !== 'completed' && i.status !== 'done'
        );
      } catch { openChecklist = []; }

      const suggestions = suggestFromTranscript(text, openChecklist);
      const created = await base44.asServiceRole.entities.CallTranscript.create({
        corporateId,
        locationId: body.locationId ? String(body.locationId) : '',
        callType: body.callType || 'other',
        callDate: body.callDate ? String(body.callDate) : '',
        title: body.title ? String(body.title) : `Call notes ${new Date().toLocaleDateString()}`,
        body: text,
        suggestionsJson: JSON.stringify(suggestions),
        ingestedByEmail: authorEmail,
        ingestedAt: new Date().toISOString(),
      });
      return Response.json({ success: true, transcript: created, suggestions });
    }

    if (action === 'listTranscripts') {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
      const rows = await base44.asServiceRole.entities.CallTranscript.filter({ corporateId }) || [];
      const transcripts = rows.map((t: any) => {
        let suggestions = [];
        try { suggestions = JSON.parse(t.suggestionsJson || '[]'); } catch { suggestions = []; }
        return { ...t, suggestions };
      });
      return Response.json({ success: true, transcripts });
    }

    if (action === 'acceptSuggestion' || action === 'rejectSuggestion') {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
      const transcriptId = String(body.transcriptId || '').trim();
      const suggestionId = String(body.suggestionId || '').trim();
      if (!transcriptId || !suggestionId) {
        return Response.json({ error: 'transcriptId and suggestionId required' }, { status: 400 });
      }
      const rows = await base44.asServiceRole.entities.CallTranscript.filter({ corporateId }) || [];
      const t = rows.find((r: any) => String(r.id) === transcriptId);
      if (!t) return Response.json({ error: 'Transcript not found' }, { status: 404 });

      let suggestions: any[] = [];
      try { suggestions = JSON.parse(t.suggestionsJson || '[]'); } catch { suggestions = []; }
      const idx = suggestions.findIndex((s) => String(s.id) === suggestionId);
      if (idx < 0) return Response.json({ error: 'Suggestion not found' }, { status: 404 });

      if (action === 'rejectSuggestion') {
        suggestions[idx] = { ...suggestions[idx], status: 'rejected' };
        await base44.asServiceRole.entities.CallTranscript.update(transcriptId, {
          suggestionsJson: JSON.stringify(suggestions),
        });
        return Response.json({ success: true, suggestions });
      }

      const sug = suggestions[idx];
      const value = body.value != null ? String(body.value) : (sug.suggestedValue || '');

      if (sug.checklistItemId) {
        try {
          const lane = (await base44.asServiceRole.entities.MerchantChecklistItem.filter({ corporateId }) || [])
            .find((i: any) => String(i.id) === String(sug.checklistItemId));
          const status = lane?.lane === 'deployment' ? 'completed' : 'done';
          await base44.asServiceRole.entities.MerchantChecklistItem.update(sug.checklistItemId, {
            status,
            completedAt: new Date().toISOString(),
            notes: lane?.notes
              ? `${lane.notes}\n[transcript] ${sug.matchPhrase || 'accepted'}`.trim()
              : `[transcript] ${sug.matchPhrase || 'accepted'}`,
          });
        } catch (e) {
          console.warn('[manageHandoff] checklist update', e);
        }
      }

      if (sug.factKey) {
        try {
          await upsertFact(base44, {
            corporateId,
            factKey: sug.factKey,
            value,
            status: 'gathered',
            locationId: t.locationId || '',
            source: 'transcript',
            evidenceRef: transcriptId,
            gatheredBy: authorEmail,
          });
        } catch (e) {
          console.warn('[manageHandoff] fact upsert', e);
        }
      }

      suggestions[idx] = { ...sug, status: 'accepted', suggestedValue: value };
      await base44.asServiceRole.entities.CallTranscript.update(transcriptId, {
        suggestionsJson: JSON.stringify(suggestions),
      });
      return Response.json({ success: true, suggestions });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[manageHandoff]', error);
    const msg = String(error?.message || error);
    if (/MerchantOnboardingFact|CallTranscript|does not exist|unknown entity/i.test(msg)) {
      return Response.json({
        error: 'Handoff entities not published yet. Republish MerchantOnboardingFact and CallTranscript in Base44.',
        code: 'ENTITY_SCHEMA_MISSING',
      }, { status: 503 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
});
