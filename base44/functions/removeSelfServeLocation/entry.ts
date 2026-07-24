import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
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
  } catch { /* invalid merchant token — fall through to workspace check */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no workspace session */ }
  return null;
}

const BOARDING_LOCKED_STATUSES = ['Pending MID', 'Active', 'Active (Existing)'];

function isSigSigned(s: any): boolean {
  const st = String(s?.status || s?.signerStatus || s?.envelopeStatus || '').toLowerCase();
  return ['signed', 'completed', 'complete', 'finished', 'done'].includes(st) || s?.signed === true;
}

async function deleteEntityRows(base44: any, entityName: string, rows: any[]) {
  for (const row of rows || []) {
    if (!row?.id) continue;
    try {
      await base44.asServiceRole.entities[entityName].delete(row.id);
    } catch (e: any) {
      console.warn(`[removeSelfServeLocation] ${entityName}.delete:`, e?.message || e);
    }
  }
}

async function stripStagedIds(base44: any, corporateId: string, opts: { midId?: string; locationId?: string }) {
  try {
    const stages = await base44.asServiceRole.entities.StagedApplication.filter({ corporateId }) || [];
    for (const stage of stages) {
      const midIds = Array.isArray(stage.includedMidIds) ? stage.includedMidIds.map(String) : [];
      const locIds = Array.isArray(stage.includedLocationIds) ? stage.includedLocationIds.map(String) : [];
      let nextMids = midIds;
      let nextLocs = locIds;
      let changed = false;
      if (opts.midId) {
        nextMids = midIds.filter((id: string) => id !== String(opts.midId));
        if (nextMids.length !== midIds.length) changed = true;
      }
      if (opts.locationId) {
        nextLocs = locIds.filter((id: string) => id !== String(opts.locationId));
        if (nextLocs.length !== locIds.length) changed = true;
      }
      if (changed) {
        await base44.asServiceRole.entities.StagedApplication.update(stage.id, {
          includedMidIds: nextMids,
          includedLocationIds: nextLocs,
        });
      }
    }
  } catch (e: any) {
    console.warn('[removeSelfServeLocation] stripStagedIds:', e?.message || e);
  }
}

async function voidMspDraft(appNo: string, mspHeaders: Record<string, string>, reason: string) {
  const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
  const result: Record<string, any> = { appNo, voided: false };
  try {
    await fetch(`${mspBase}/applications/${appNo}/signatures`, {
      method: 'DELETE',
      headers: mspHeaders,
      body: JSON.stringify({ reason }),
    });
  } catch { /* best-effort revoke */ }
  try {
    const voidRes = await fetch(`${mspBase}/applications/${appNo}`, { method: 'DELETE', headers: mspHeaders });
    if (voidRes.ok || voidRes.status === 404) {
      result.voided = true;
      return result;
    }
    const cancelRes = await fetch(`${mspBase}/applications/${appNo}`, {
      method: 'PATCH',
      headers: mspHeaders,
      body: JSON.stringify({ status: 'Cancelled' }),
    });
    result.voided = cancelRes.ok || cancelRes.status === 404;
  } catch (e: any) {
    result.error = e?.message || String(e);
  }
  return result;
}

async function inspectAnyoneSigned(appNo: string, mspHeaders: Record<string, string>) {
  const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
  try {
    const statusRes = await fetch(`${mspBase}/applications/${appNo}/signatures`, { headers: mspHeaders });
    if (!statusRes.ok) return false;
    const statusData = await statusRes.json().catch(() => ({}));
    return (statusData?.signers || []).some(isSigSigned);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { locationId } = body;

    if (!locationId) {
      return Response.json({ error: 'locationId is required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const loc = await base44.asServiceRole.entities.MerchantLocations.get(locationId).catch(() => null);
    if (!loc) return Response.json({ error: 'Location not found' }, { status: 404 });
    if (actor.actor === 'merchant' && String(loc.corporateId) !== actor.corporateId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const corporateId = String(loc.corporateId || '');
    const lockProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    const lockProfile = lockProfiles?.[0];
    const lock = String(lockProfile?.portalLockStatus || 'unlocked').toLowerCase();
    const formsLocked = lockProfile?.applicationStatus === 'Submitted'
      || lock === 'signing' || lock === 'pending_signature' || lock === 'all_signed';

    // Merchants cannot delete while locked. Agents may delete draft-only locations while locked.
    if (formsLocked && actor.actor !== 'admin') {
      return Response.json({
        error: 'Forms are locked while the merchant agreement is in signing. Contact Cliqbux to unlock.',
        code: 'FORMS_LOCKED',
      }, { status: 423 });
    }

    const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ locationId }) || [];
    for (const mid of merchantMIDs) {
      if (BOARDING_LOCKED_STATUSES.includes(mid.applicationStepStatus)) {
        return Response.json({
          error: `Cannot delete location: MID "${mid.dbaName || mid.id}" is already with the processor.`,
          code: 'MID_BOARDED',
        }, { status: 403 });
      }
    }

    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const mspHeaders = {
      'X-API-KEY': apiKey,
      'X-App-ID': appId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const mspResults: any[] = [];
    for (const mid of merchantMIDs) {
      const appNo = mid.mspApplicationNo ? String(mid.mspApplicationNo) : null;
      if (!appNo) continue;
      if (!apiKey) {
        return Response.json({
          error: 'MSP_APP_KEY not set — cannot void MSPWare drafts before delete.',
          code: 'MSP_ENV_MISSING',
        }, { status: 500 });
      }
      if (await inspectAnyoneSigned(appNo, mspHeaders)) {
        return Response.json({
          error: `Cannot delete: application ${appNo} (${mid.dbaName || mid.id}) has already been signed.`,
          code: 'MID_SIGNED',
        }, { status: 403 });
      }
      const voided = await voidMspDraft(appNo, mspHeaders, 'Location deleted from Cliqbux onboarding');
      mspResults.push(voided);
      if (!voided.voided) {
        return Response.json({
          error: `Could not void MSPWare draft ${appNo}. Cancel it in MSPWare, then retry.`,
          code: 'MSP_VOID_FAILED',
          mspResults,
        }, { status: 502 });
      }
    }

    for (const mid of merchantMIDs) {
      try {
        const uw = await base44.asServiceRole.entities.UnderwritingMessage.filter({ midId: mid.id }) || [];
        await deleteEntityRows(base44, 'UnderwritingMessage', uw);
      } catch { /* entity may be unpublished */ }
      try {
        const items = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ midId: mid.id }) || [];
        await deleteEntityRows(base44, 'MerchantChecklistItem', items);
      } catch { /* */ }
      await stripStagedIds(base44, corporateId, { midId: String(mid.id) });
      await base44.asServiceRole.entities.MerchantMID.delete(mid.id);
    }

    try {
      const items = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ locationId }) || [];
      await deleteEntityRows(base44, 'MerchantChecklistItem', items);
    } catch { /* */ }
    try {
      const facts = await base44.asServiceRole.entities.MerchantOnboardingFact.filter({ locationId }) || [];
      await deleteEntityRows(base44, 'MerchantOnboardingFact', facts);
    } catch { /* */ }
    try {
      const transcripts = await base44.asServiceRole.entities.CallTranscript.filter({ locationId }) || [];
      await deleteEntityRows(base44, 'CallTranscript', transcripts);
    } catch { /* */ }
    try {
      const msgs = await base44.asServiceRole.entities.MerchantInstallerMessage.filter({ locationId }) || [];
      await deleteEntityRows(base44, 'MerchantInstallerMessage', msgs);
    } catch { /* */ }
    await stripStagedIds(base44, corporateId, { locationId: String(locationId) });

    await base44.asServiceRole.entities.MerchantLocations.delete(locationId);
    return Response.json({
      success: true,
      deletedMIDs: merchantMIDs.length,
      mspResults,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
