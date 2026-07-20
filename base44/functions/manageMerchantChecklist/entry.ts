/**
 * manageMerchantChecklist — merchant + admin checklist for Merchant Center.
 *
 * Actions:
 *   list            — sync auto items, return open + done (merchant own corp / admin)
 *   requestDocument — admin: create agent upload request { title, detail?, dueAt?, locationId?, midId? }
 *   upload          — merchant/admin: attach file and mark done { itemId, fileUrl, fileName }
 *   markDone        — merchant/admin: complete without file (non-upload items)
 *   reopen          — admin only
 *
 * Auto kinds: quote_unsigned, quote_unpaid, mcc_help, missing_bank, liquor_license, mid_error
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

const LIQUOR_STATES = new Set(['CA', 'NY']);
function isLiquorMcc(mcc: string) {
  const base = String(mcc || '').trim().toUpperCase().replace(/[A-Z]+$/, '');
  return base === '5813';
}

function hasBank(loc: any, mid: any) {
  const bd = mid?.bankDetails || loc?.bankDetails;
  if (bd?.routingNumber && bd?.accountNumber) return true;
  if (loc?.routingNumber && loc?.accountNumber) return true;
  return false;
}

async function resolveQuoteFlags(base44: any, corporateId: string, profile: any) {
  let quoteMissing = !profile?.hubspotQuoteUrl;
  let quoteUnsigned = false;
  let quoteUnpaid = false;
  try {
    // Lightweight: use profile stamps; HubSpot live pull is owned by getHubspotQuote on the UI
    if (profile?.equipmentPaidAt) {
      quoteMissing = false;
      quoteUnsigned = false;
      quoteUnpaid = false;
    } else if (profile?.quoteSignedAt) {
      quoteMissing = false;
      quoteUnsigned = false;
      quoteUnpaid = true;
    } else if (profile?.hubspotQuoteUrl) {
      quoteMissing = false;
      quoteUnsigned = true;
      quoteUnpaid = false;
    }
  } catch { /* keep defaults */ }
  return { quoteMissing, quoteUnsigned, quoteUnpaid };
}

async function syncAutoItems(base44: any, corporateId: string) {
  const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
    { corporateId }, '-created_date', 1
  );
  const profile = profiles[0];
  if (!profile) return { profile: null, items: [] as any[] };

  const [locations, mids, existing] = await Promise.all([
    base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
    base44.asServiceRole.entities.MerchantMID.filter({ corporateId }),
    base44.asServiceRole.entities.MerchantChecklistItem.filter({ corporateId }),
  ]);

  const desired: Array<{
    autoKey: string;
    kind: string;
    title: string;
    detail: string;
    requiresUpload: boolean;
    midId?: string;
    locationId?: string;
  }> = [];

  const { quoteMissing, quoteUnsigned, quoteUnpaid } = await resolveQuoteFlags(base44, corporateId, profile);

  if (quoteMissing && profile.applicationStatus === 'Submitted') {
    desired.push({
      autoKey: 'quote_missing',
      kind: 'quote_missing',
      title: 'Equipment quote coming',
      detail: 'Your Cliqbux rep is attaching your equipment quote. It will appear on this page when ready — you do not need to leave the Merchant Center.',
      requiresUpload: false,
    });
  }
  if (quoteUnsigned) {
    desired.push({
      autoKey: 'quote_unsigned',
      kind: 'quote_unsigned',
      title: 'Sign your equipment quote',
      detail: 'Review and sign the quote below so we can unlock menu setup and invoice payment.',
      requiresUpload: false,
    });
  }
  if (quoteUnpaid) {
    desired.push({
      autoKey: 'quote_unpaid',
      kind: 'quote_unpaid',
      title: 'Pay your equipment invoice',
      detail: 'Complete payment so terminals can ship. Menu and POS setup are already unlocked.',
      requiresUpload: false,
    });
  }

  for (const mid of mids || []) {
    if (mid.mccHelpRequested && !mid.mccCode) {
      desired.push({
        autoKey: `mcc_help:${mid.id}`,
        kind: 'mcc_help',
        title: `Business category help — ${mid.dbaName || mid.merchantName || 'MID'}`,
        detail: 'You asked for help choosing a business category. Cliqbux will set the correct MCC before underwriting finishes.',
        requiresUpload: false,
        midId: mid.id,
        locationId: mid.locationId,
      });
    }
    if (mid.applicationStepStatus === 'Error') {
      desired.push({
        autoKey: `mid_error:${mid.id}`,
        kind: 'mid_error',
        title: `Application needs attention — ${mid.dbaName || 'MID'}`,
        detail: 'Something blocked boarding for this merchant ID. Your Cliqbux rep will follow up, or unlock the application to fix details.',
        requiresUpload: false,
        midId: mid.id,
        locationId: mid.locationId,
      });
    }
    const loc = (locations || []).find((l: any) => String(l.id) === String(mid.locationId));
    if (loc && !hasBank(loc, mid) && profile.applicationStatus === 'Submitted') {
      desired.push({
        autoKey: `missing_bank:${mid.id}`,
        kind: 'missing_bank',
        title: `Bank account needed — ${mid.dbaName || loc.dbaName || 'Location'}`,
        detail: 'Link a deposit account so funding can be set up. Ask your rep to unlock the application if forms are locked.',
        requiresUpload: false,
        midId: mid.id,
        locationId: loc.id,
      });
    }
    if (loc && isLiquorMcc(mid.mccCode) && LIQUOR_STATES.has(String(loc.businessState || '').toUpperCase())) {
      if (!loc.liquorLicenseDocUrl) {
        desired.push({
          autoKey: `liquor_license:${loc.id}`,
          kind: 'liquor_license',
          title: `Upload liquor license — ${loc.dbaName || 'Location'}`,
          detail: `${loc.businessState} Bar & Tavern applications need a state-issued liquor license on file.`,
          requiresUpload: true,
          midId: mid.id,
          locationId: loc.id,
        });
      }
    }
  }

  const existingAuto = (existing || []).filter((i: any) => i.source === 'auto');
  const byKey = new Map(existingAuto.map((i: any) => [i.autoKey || `${i.kind}:${i.id}`, i]));

  for (const d of desired) {
    const prev = byKey.get(d.autoKey);
    if (prev) {
      byKey.delete(d.autoKey);
      // Refresh title/detail; reopen if previously auto-closed and still needed
      const patch: any = {
        title: d.title,
        detail: d.detail,
        requiresUpload: d.requiresUpload,
      };
      if (prev.status === 'done' && !prev.fileUrl && d.kind !== 'liquor_license') {
        // Quote/bank auto items: if still desired, reopen unless merchant/agent marked done with intent
        // Keep done for upload completions; for non-upload auto, reopen when condition persists
        if (!['quote_missing', 'quote_unsigned', 'quote_unpaid', 'missing_bank', 'mcc_help', 'mid_error'].includes(d.kind)) {
          /* keep */
        } else if (!prev.completedAt) {
          patch.status = 'open';
        }
      }
      // Auto-close quote items when stamps advance — handled by not including in desired
      try {
        await base44.asServiceRole.entities.MerchantChecklistItem.update(prev.id, patch);
      } catch (e) {
        console.warn('[manageMerchantChecklist] update auto', e);
      }
    } else {
      try {
        await base44.asServiceRole.entities.MerchantChecklistItem.create({
          corporateId,
          source: 'auto',
          kind: d.kind,
          autoKey: d.autoKey,
          title: d.title,
          detail: d.detail,
          status: 'open',
          requiresUpload: d.requiresUpload,
          midId: d.midId || '',
          locationId: d.locationId || '',
        });
      } catch (e) {
        console.warn('[manageMerchantChecklist] create auto', e);
      }
    }
  }

  // Desired no longer present → mark auto items done
  for (const [, stale] of byKey) {
    if (stale.status === 'open') {
      try {
        await base44.asServiceRole.entities.MerchantChecklistItem.update(stale.id, {
          status: 'done',
          completedAt: new Date().toISOString(),
        });
      } catch { /* ignore */ }
    }
  }

  const refreshed = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ corporateId });
  return { profile, locations, mids, items: refreshed || [] };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await getPortalActor(req, base44);
    if (!actor) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');
    const corporateId = String(body.corporateId || '').trim();
    if (!corporateId) {
      return Response.json({ error: 'corporateId required' }, { status: 400 });
    }
    if (actor.actor === 'merchant' && actor.corporateId !== corporateId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'list') {
      const { items } = await syncAutoItems(base44, corporateId);
      const open = (items || []).filter((i: any) => i.status === 'open');
      const done = (items || []).filter((i: any) => i.status === 'done');
      return Response.json({
        success: true,
        openCount: open.length,
        items: items || [],
        open,
        done,
      });
    }

    if (action === 'requestDocument') {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
      const title = String(body.title || '').trim();
      if (!title) {
        return Response.json({ error: 'title required' }, { status: 400 });
      }
      let authorEmail = '';
      let authorName = '';
      try {
        const me = await base44.auth.me();
        authorEmail = me?.email || '';
        authorName = me?.full_name || me?.name || authorEmail;
      } catch { /* ignore */ }

      const created = await base44.asServiceRole.entities.MerchantChecklistItem.create({
        corporateId,
        source: 'agent',
        kind: 'custom_doc',
        title,
        detail: String(body.detail || '').trim(),
        status: 'open',
        requiresUpload: true,
        dueAt: body.dueAt ? String(body.dueAt) : '',
        locationId: body.locationId ? String(body.locationId) : '',
        midId: body.midId ? String(body.midId) : '',
        requestedByEmail: authorEmail,
        requestedByName: authorName,
      });
      return Response.json({ success: true, item: created });
    }

    if (action === 'upload') {
      const itemId = String(body.itemId || '').trim();
      const fileUrl = String(body.fileUrl || '').trim();
      const fileName = String(body.fileName || '').trim();
      if (!itemId || !fileUrl) {
        return Response.json({ error: 'itemId and fileUrl required' }, { status: 400 });
      }
      const items = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ id: itemId });
      // Base44 filter by id may need get — try filter corporateId + find
      let item = items?.[0];
      if (!item) {
        const all = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ corporateId });
        item = (all || []).find((i: any) => String(i.id) === itemId);
      }
      if (!item || String(item.corporateId) !== corporateId) {
        return Response.json({ error: 'Item not found' }, { status: 404 });
      }

      const updated = await base44.asServiceRole.entities.MerchantChecklistItem.update(itemId, {
        fileUrl,
        fileName,
        uploadedAt: new Date().toISOString(),
        status: 'done',
        completedAt: new Date().toISOString(),
      });

      // Mirror liquor license onto location when kind matches
      if (item.kind === 'liquor_license' && item.locationId) {
        try {
          await base44.asServiceRole.entities.MerchantLocations.update(item.locationId, {
            liquorLicenseDocUrl: fileUrl,
            liquorLicenseFileName: fileName,
            liquorLicenseUploadedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('[manageMerchantChecklist] liquor mirror failed', e);
        }
      }

      return Response.json({ success: true, item: updated });
    }

    if (action === 'markDone') {
      const itemId = String(body.itemId || '').trim();
      if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 });
      const all = await base44.asServiceRole.entities.MerchantChecklistItem.filter({ corporateId });
      const item = (all || []).find((i: any) => String(i.id) === itemId);
      if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });
      if (item.requiresUpload && !item.fileUrl && actor.actor === 'merchant') {
        return Response.json({ error: 'Upload a file to complete this item' }, { status: 422 });
      }
      const updated = await base44.asServiceRole.entities.MerchantChecklistItem.update(itemId, {
        status: 'done',
        completedAt: new Date().toISOString(),
      });
      return Response.json({ success: true, item: updated });
    }

    if (action === 'reopen') {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
      }
      const itemId = String(body.itemId || '').trim();
      if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 });
      const updated = await base44.asServiceRole.entities.MerchantChecklistItem.update(itemId, {
        status: 'open',
        completedAt: '',
      });
      return Response.json({ success: true, item: updated });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[manageMerchantChecklist]', error);
    const msg = String(error?.message || error);
    if (/MerchantChecklistItem|does not exist|unknown entity/i.test(msg)) {
      return Response.json({
        error: 'Checklist entity not published yet. Republish MerchantChecklistItem in Base44.',
        code: 'ENTITY_SCHEMA_MISSING',
      }, { status: 503 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
});
