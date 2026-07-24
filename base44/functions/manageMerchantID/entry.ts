import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
// getPortalActor returns { actor: 'merchant', corporateId } when the request
// carries a valid merchant JWT (issued by validateResumeToken, createHubspotDeal,
// or manageStagedApplication 'validate'), { actor: 'admin' } when it carries a
// Base44 workspace session, or null when neither. Callers must 401 on null and
// enforce corporateId match for merchant actors.
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

// Sync with src/lib/businessWebsite.js — Base44 cannot import frontend helpers.
const BUSINESS_WEBSITE_HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
function normalizeBusinessWebsite(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';
  s = s.replace(/[.,;)\]]+$/g, '');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}
function isValidBusinessWebsite(raw: string): boolean {
  const normalized = normalizeBusinessWebsite(raw);
  if (!normalized) return false;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = String(url.hostname || '').toLowerCase();
  if (!host || host === 'localhost') return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return false;
  return BUSINESS_WEBSITE_HOST_RE.test(host);
}
function assertBusinessWebsiteOrError(raw: string, required: boolean): string | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return required
      ? 'Business homepage URL is required when Online volume is greater than 0%.'
      : null;
  }
  if (!isValidBusinessWebsite(trimmed)) {
    return 'Enter a valid website (e.g. https://www.example.com or example.com).';
  }
  return null;
}


// Maps the merchant's chosen pricingTier to the correct MSPWare pricing_method.
// MerchantMID.pricingMethod has a schema-level default of 'ICPLS', which will
// silently mask this derivation if the field is left unset at create time —
// always set it explicitly here rather than relying on the schema default.
// 2026-07-06: added the 3 canonical simplified tier names (see AGENTS.md Critical
// Lesson #12). Legacy values kept mapped for historical/in-flight records.
const TIER_TO_METHOD: Record<string, string> = {
  'CUSTOM_FLAT_RATE': 'FLAT',
  'CUSTOM_INTERCHANGE_PLUS': 'ICPLS',
  'SELF_SERVE_CASH_DISCOUNT': 'TIERD',
  'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS',
  'SELF_SWIPED': 'ICPLS', 'SELF_KEYED': 'ICPLS', // ON HOLD — see Critical Lesson #12
  // 2026-07-03: Teddy confirmed Cliqbux never uses MSPWare's "Clear and Simple"
  // pricing method — every Cash Discount plan uses "Tiered" (wire value TIERD)
  // instead, with a flat-rate fee schedule sent explicitly in buildFormPayload
  // (see submitToMSP/signApplication + docs/mspware-field-reference.md).
  'CASH_DISCOUNT': 'TIERD', 'SELF_CASH_DISCOUNT': 'TIERD',
};

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
      console.warn(`[manageMerchantID] ${entityName}.delete failed:`, e?.message || e);
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
    console.warn('[manageMerchantID] stripStagedIds:', e?.message || e);
  }
}

async function voidMspDraft(appNo: string, mspHeaders: Record<string, string>, reason: string) {
  const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
  const result: Record<string, any> = { appNo, signatureRevoke: 'skipped', draftAction: 'pending' };
  try {
    const delSig = await fetch(`${mspBase}/applications/${appNo}/signatures`, {
      method: 'DELETE',
      headers: mspHeaders,
      body: JSON.stringify({ reason }),
    });
    result.signatureRevoke = delSig.ok || delSig.status === 404
      ? (delSig.status === 404 ? 'already_gone' : 'revoked')
      : 'failed';
    result.signatureRevokeHttp = delSig.status;
  } catch (e: any) {
    result.signatureRevoke = 'unreachable';
    result.signatureRevokeError = e?.message || String(e);
  }

  try {
    const voidRes = await fetch(`${mspBase}/applications/${appNo}`, {
      method: 'DELETE',
      headers: mspHeaders,
    });
    if (voidRes.ok || voidRes.status === 404) {
      result.draftAction = voidRes.status === 404 ? 'cleared_404' : 'voided';
      result.voided = true;
      return result;
    }
    const cancelRes = await fetch(`${mspBase}/applications/${appNo}`, {
      method: 'PATCH',
      headers: mspHeaders,
      body: JSON.stringify({ status: 'Cancelled' }),
    });
    if (cancelRes.ok || cancelRes.status === 404) {
      result.draftAction = 'cancelled';
      result.voided = true;
      return result;
    }
    result.draftAction = 'void_failed';
    result.voided = false;
    result.draftHttp = cancelRes.status;
  } catch (e: any) {
    result.draftAction = 'void_unreachable';
    result.voided = false;
    result.draftError = e?.message || String(e);
  }
  return result;
}

async function inspectMidSignatures(appNo: string, mspHeaders: Record<string, string>) {
  const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
  try {
    const statusRes = await fetch(`${mspBase}/applications/${appNo}/signatures`, { headers: mspHeaders });
    if (statusRes.status === 404) return { packageExists: false, anyoneSigned: false };
    if (!statusRes.ok) return { packageExists: false, anyoneSigned: false, inspectError: `HTTP ${statusRes.status}` };
    const statusData = await statusRes.json().catch(() => ({}));
    const pkgSigners = statusData?.signers || [];
    const envelope = String(statusData?.envelopeStatus || statusData?.status || '').toLowerCase();
    const packageExists = pkgSigners.length > 0
      || (statusData?.success === true && !!envelope && envelope !== 'none')
      || ['new', 'sent', 'out for signature', 'pending', 'inprogress', 'in progress'].includes(envelope);
    const anyoneSigned = pkgSigners.some(isSigSigned);
    return { packageExists, anyoneSigned };
  } catch (e: any) {
    return { packageExists: false, anyoneSigned: false, inspectError: e?.message || String(e) };
  }
}

async function cascadeDeleteMidRecords(base44: any, mid: any) {
  const midId = mid.id;
  const corporateId = mid.corporateId;
  try {
    const uw = await base44.asServiceRole.entities.UnderwritingMessage.filter({ midId }) || [];
    await deleteEntityRows(base44, 'UnderwritingMessage', uw);
  } catch (e: any) {
    console.warn('[manageMerchantID] UW cascade:', e?.message || e);
  }
  try {
    const items = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ midId }) || [];
    await deleteEntityRows(base44, 'MerchantChecklistItem', items);
  } catch (e: any) {
    console.warn('[manageMerchantID] checklist mid cascade:', e?.message || e);
  }
  if (corporateId) await stripStagedIds(base44, String(corporateId), { midId: String(midId) });
}

async function cascadeDeleteLocationRecords(base44: any, locationId: string, corporateId: string) {
  try {
    const items = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ locationId }) || [];
    await deleteEntityRows(base44, 'MerchantChecklistItem', items);
  } catch (e: any) {
    console.warn('[manageMerchantID] checklist loc cascade:', e?.message || e);
  }
  try {
    const facts = await base44.asServiceRole.entities.MerchantOnboardingFact.filter({ locationId }) || [];
    await deleteEntityRows(base44, 'MerchantOnboardingFact', facts);
  } catch (e: any) {
    console.warn('[manageMerchantID] facts cascade:', e?.message || e);
  }
  try {
    const transcripts = await base44.asServiceRole.entities.CallTranscript.filter({ locationId }) || [];
    await deleteEntityRows(base44, 'CallTranscript', transcripts);
  } catch (e: any) {
    console.warn('[manageMerchantID] transcripts cascade:', e?.message || e);
  }
  try {
    const msgs = await base44.asServiceRole.entities.MerchantInstallerMessage.filter({ locationId }) || [];
    await deleteEntityRows(base44, 'MerchantInstallerMessage', msgs);
  } catch (e: any) {
    console.warn('[manageMerchantID] installer cascade:', e?.message || e);
  }
  if (corporateId) await stripStagedIds(base44, String(corporateId), { locationId: String(locationId) });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, corporateId, locationId, merchantIDId, data } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // — LIST —
    if (action === 'list') {
      const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId });
      return Response.json({ merchantIDs: merchantMIDs || [] });
    }

    // Portal form lock — block add/update while signing packages are live.
    // Delete has its own rules (agents may remove draft-only MIDs while locked).
    if (action !== 'delete') {
      const lockProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const lockProfile = lockProfiles?.[0];
      const lock = String(lockProfile?.portalLockStatus || 'unlocked').toLowerCase();
      const formsLocked = lockProfile?.applicationStatus === 'Submitted'
        || lock === 'signing' || lock === 'pending_signature' || lock === 'all_signed';
      if (formsLocked) {
        return Response.json({
          error: 'Forms are locked while the merchant agreement is in signing. Use Unlock & Modify Details first.',
          code: 'FORMS_LOCKED',
        }, { status: 423 });
      }
    }

    // — ADD —
    if (action === 'add') {
      if (!locationId) return Response.json({ error: 'locationId is required' }, { status: 400 });

      // Derive pricingMethod from the merchant's chosen pricingTier — must be set
      // explicitly, since MerchantMID.pricingMethod's schema default ('ICPLS')
      // would otherwise silently override a Cash Discount merchant's real method.
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const profile = profiles?.[0];
      const pricingMethod = data?.pricingMethod || TIER_TO_METHOD[(profile?.pricingTier || '').toUpperCase()] || 'ICPLS';

      if (String(data?.mccCode || '').trim() === '5999') {
        return Response.json({
          error: 'MCC 5999 is not allowed (restricted merchant category — rejected in CA/CO/NY). Choose a specific retail MCC.',
        }, { status: 422 });
      }

      const addInt = data?.internetPct != null ? Number(data.internetPct) : 0;
      const addSite = String(data?.businessWebsite || '').trim();
      const addSiteErr = assertBusinessWebsiteOrError(addSite, Number.isFinite(addInt) && addInt > 0);
      if (addSiteErr) {
        return Response.json({ error: addSiteErr }, { status: 422 });
      }

      const merchantMIDData = {
        locationId,
        corporateId,
        merchantName: data?.merchantName || locationId,
        dbaName: data?.merchantName || data?.dbaName || '',
        mccCode: data?.mccCode || '',
        industryType: data?.industryType || '',
        pricingMethod,
        monthlyCardSales: data?.monthlyCardSales ? Number(data.monthlyCardSales) : 0,
        avgSaleAmount: data?.avgSaleAmount ? Number(data.avgSaleAmount) : 0,
        highestTicketAmount: data?.highestTicketAmount ? Number(data.highestTicketAmount) : 0,
        cardPresentPct: data?.cardPresentPct != null ? Number(data.cardPresentPct) : 100,
        internetPct: data?.internetPct != null ? Number(data.internetPct) : 0,
        motoPct: data?.motoPct != null ? Number(data.motoPct) : 0,
        ...(addSite ? { businessWebsite: normalizeBusinessWebsite(addSite) } : {}),
        ...(data?.mccHelpRequested !== undefined ? { mccHelpRequested: Boolean(data.mccHelpRequested) } : {}),
        applicationStepStatus: 'In Review',
      };
      const merchantMID = await base44.asServiceRole.entities.MerchantMID.create(merchantMIDData);

      // 2026-07-23: do NOT auto-create MSPWare drafts here. Drafts are created
      // only when someone clicks Prepare form (prepareMSPForms → submitToMSP).
      // Background drafts caused orphan MSP rows and fought Unlock.

      return Response.json({ merchantID: merchantMID });
    }

    // — UPDATE —
    if (action === 'update') {
      if (!merchantIDId) return Response.json({ error: 'merchantIDId is required for update' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.MerchantMID.get(merchantIDId);
      const LOCKED = ['Pending MID', 'Active', 'Active (Existing)'];
      if (existing && LOCKED.includes(existing.applicationStepStatus) && !(data?.applicationStepStatus !== undefined && Object.keys(data).length === 1)) {
        return Response.json({ error: 'Cannot edit: Application is in a locked status' }, { status: 403 });
      }
      const updateFields = {};
      const d = data || {};
      // Renaming the merchant name also updates the DBA sent to Elavon, mirroring the prior behavior.
      if (d.merchantName !== undefined) { updateFields.merchantName = d.merchantName; updateFields.dbaName = d.merchantName; }
      if (d.mccCode !== undefined) updateFields.mccCode = d.mccCode;
      // Merchant asked for help picking a category ("My business isn't listed").
      // Never invent an MCC (Critical Lesson #15) — mccCode stays empty and an
      // agent sets the real code later. Picking a real MCC clears the flag.
      if (d.mccHelpRequested !== undefined) updateFields.mccHelpRequested = Boolean(d.mccHelpRequested);
      if (d.mccCode !== undefined && String(d.mccCode).trim() && d.mccHelpRequested === undefined) {
        updateFields.mccHelpRequested = false;
      }
      if (d.industryType !== undefined) updateFields.industryType = d.industryType;
      if (d.monthlyCardSales !== undefined) updateFields.monthlyCardSales = Number(d.monthlyCardSales);
      if (d.avgSaleAmount !== undefined) updateFields.avgSaleAmount = Number(d.avgSaleAmount);
      if (d.highestTicketAmount !== undefined) updateFields.highestTicketAmount = Number(d.highestTicketAmount);
      if (d.cardPresentPct !== undefined) updateFields.cardPresentPct = Number(d.cardPresentPct);
      if (d.internetPct !== undefined) updateFields.internetPct = Number(d.internetPct);
      if (d.motoPct !== undefined) updateFields.motoPct = Number(d.motoPct);
      if (d.businessWebsite !== undefined) {
        const site = String(d.businessWebsite || '').trim();
        if (site && !isValidBusinessWebsite(site)) {
          return Response.json({
            error: 'Enter a valid website (e.g. https://www.example.com or example.com).',
          }, { status: 422 });
        }
        updateFields.businessWebsite = site ? normalizeBusinessWebsite(site) : null;
      }
      // Require valid homepage URL when Online (internet) volume > 0
      {
        const nextInt = d.internetPct !== undefined
          ? Number(d.internetPct)
          : Number(existing?.internetPct ?? 0);
        const nextSite = d.businessWebsite !== undefined
          ? String(d.businessWebsite || '').trim()
          : String(existing?.businessWebsite || '').trim();
        const siteErr = assertBusinessWebsiteOrError(nextSite, Number.isFinite(nextInt) && nextInt > 0);
        if (siteErr) {
          return Response.json({ error: siteErr }, { status: 422 });
        }
      }
      if (d.locationId !== undefined) updateFields.locationId = d.locationId;
      if (d.applicationStepStatus !== undefined) updateFields.applicationStepStatus = d.applicationStepStatus;
      if (d.alcoholSalesPercentage !== undefined) {
        if (d.alcoholSalesPercentage === null || d.alcoholSalesPercentage === '') {
          updateFields.alcoholSalesPercentage = null;
        } else {
          const alcoholPct = Number(d.alcoholSalesPercentage);
          if (!Number.isFinite(alcoholPct) || alcoholPct < 0 || alcoholPct > 100) {
            return Response.json({ error: 'alcoholSalesPercentage must be a number from 0 to 100' }, { status: 422 });
          }
          updateFields.alcoholSalesPercentage = alcoholPct;
        }
      }

      // Reject restricted MCC at the write boundary so it never reaches MSPWare.
      if (updateFields.mccCode !== undefined && String(updateFields.mccCode).trim() === '5999') {
        return Response.json({
          error: 'MCC 5999 is not allowed (restricted merchant category — rejected in CA/CO/NY). Choose a specific retail MCC.',
        }, { status: 422 });
      }

      // CA/NY + 5813: require alcohol sales % (liquor license is post-sign only — do not block here).
      const effectiveMccForCompliance = String(
        updateFields.mccCode !== undefined ? updateFields.mccCode : (existing?.mccCode || '')
      ).trim();
      const locForCompliance = existing?.locationId
        ? await base44.asServiceRole.entities.MerchantLocations.get(existing.locationId).catch(() => null)
        : null;
      const locState = String(locForCompliance?.businessState || '').trim().toUpperCase();
      const mccBaseForCompliance = effectiveMccForCompliance.toUpperCase().replace(/[A-Z]+$/, '');
      const needsLiquorCompliance = (locState === 'CA' || locState === 'NY') && mccBaseForCompliance === '5813';
      if (needsLiquorCompliance) {
        const alcoholVal = updateFields.alcoholSalesPercentage !== undefined
          ? updateFields.alcoholSalesPercentage
          : existing?.alcoholSalesPercentage;
        const alcoholNum = Number(alcoholVal);
        if (alcoholVal === null || alcoholVal === undefined || alcoholVal === '' || !Number.isFinite(alcoholNum) || alcoholNum < 0 || alcoholNum > 100) {
          return Response.json({
            error: 'Alcohol sales percentage (0–100) is required for Bar/Tavern (MCC 5813) locations in CA and NY.',
          }, { status: 422 });
        }
      }

      const updated = await base44.asServiceRole.entities.MerchantMID.update(merchantIDId, updateFields);

      // 2026-07-23: no auto submitToMSP on update — Prepare form owns MSP fills.

      return Response.json({ updatedMerchantID: updated, merchantID: updated });
    }

    // — DELETE —
    // Draft-only MIDs: void MSPWare app (if any), cascade related records, delete MID.
    // If this was the last MID on the location, remove the location too.
    // Signed / boarded MIDs cannot be deleted.
    if (action === 'delete') {
      if (!merchantIDId) return Response.json({ error: 'merchantIDId is required for delete' }, { status: 400 });
      const toDelete = await base44.asServiceRole.entities.MerchantMID.get(merchantIDId).catch(() => null);
      if (!toDelete) return Response.json({ error: 'MerchantMID not found' }, { status: 404 });
      if (String(toDelete.corporateId) !== String(corporateId)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (BOARDING_LOCKED_STATUSES.includes(toDelete.applicationStepStatus)) {
        return Response.json({
          error: 'Cannot delete: this MID is already with the processor (Pending MID / Active).',
          code: 'MID_BOARDED',
        }, { status: 403 });
      }

      const lockProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const lockProfile = lockProfiles?.[0];
      const lock = String(lockProfile?.portalLockStatus || 'unlocked').toLowerCase();
      const formsLocked = lockProfile?.applicationStatus === 'Submitted'
        || lock === 'signing' || lock === 'pending_signature' || lock === 'all_signed';
      const isAgent = actor.actor === 'admin';

      // Merchants may only delete while forms are unlocked.
      if (formsLocked && !isAgent) {
        return Response.json({
          error: 'Forms are locked while the merchant agreement is in signing. Contact Cliqbux to unlock.',
          code: 'FORMS_LOCKED',
        }, { status: 423 });
      }

      const apiKey = Deno.env.get('MSP_APP_KEY') || '';
      const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
      const mspHeaders = {
        'X-API-KEY': apiKey,
        'X-App-ID': appId,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      let mspVoid: any = null;
      const appNo = toDelete.mspApplicationNo ? String(toDelete.mspApplicationNo) : null;
      if (appNo && apiKey) {
        const inspect = await inspectMidSignatures(appNo, mspHeaders);
        if (inspect.anyoneSigned) {
          return Response.json({
            error: 'Cannot delete: this application has already been signed. Unlock the deal only if you must change details, then recreate — do not delete a signed MID.',
            code: 'MID_SIGNED',
          }, { status: 403 });
        }
        // Unsigned package or draft-only — revoke package (if any) and void the MSP app.
        mspVoid = await voidMspDraft(appNo, mspHeaders, 'MID deleted from Cliqbux onboarding');
        if (!mspVoid.voided) {
          return Response.json({
            error: `Could not void MSPWare draft ${appNo}. Fix or cancel it in MSPWare, then retry delete.`,
            code: 'MSP_VOID_FAILED',
            mspVoid,
          }, { status: 502 });
        }
      } else if (appNo && !apiKey) {
        return Response.json({
          error: 'MSP_APP_KEY not set — cannot void the MSPWare draft before delete.',
          code: 'MSP_ENV_MISSING',
        }, { status: 500 });
      }

      await cascadeDeleteMidRecords(base44, toDelete);
      await base44.asServiceRole.entities.MerchantMID.delete(merchantIDId);

      let locationDeleted = false;
      const locId = toDelete.locationId ? String(toDelete.locationId) : null;
      if (locId) {
        const remaining = await base44.asServiceRole.entities.MerchantMID.filter({ locationId: locId }) || [];
        if (remaining.length === 0) {
          await cascadeDeleteLocationRecords(base44, locId, String(corporateId));
          try {
            await base44.asServiceRole.entities.MerchantLocations.delete(locId);
            locationDeleted = true;
          } catch (e: any) {
            console.warn('[manageMerchantID] location delete:', e?.message || e);
          }
        }
      }

      return Response.json({
        success: true,
        deletedMidId: merchantIDId,
        locationDeleted,
        locationId: locId,
        mspVoid,
      });
    }

    return Response.json({ error: 'Unknown action. Use list, add, update, or delete.' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
