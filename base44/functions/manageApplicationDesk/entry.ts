/**
 * manageApplicationDesk — admin-only Deal Room notes/tasks + snapshot.
 *
 * Actions:
 *   get        — profile + account + mids + signers + locations + desk items + UW messages
 *   addNote    — { corporateId, body }
 *   addTask    — { corporateId, body, assignee?, dueAt? }
 *   updateTask — { corporateId, itemId, status?, body?, assignee?, dueAt? }
 *   deleteItem — { corporateId, itemId }
 *   setMidAwb  — { corporateId, midId, elavonAwb } — admin; works even when MID is locked
 *   logUwMessage — { corporateId, midId?, elavonAwb?, subject?, bodyText, direction?, fromAddress?, toAddress?, messageDate? }
 *   deleteUwMessage — { corporateId, messageId }
 *   requestStatusInquiry — { corporateId, midId } — logs outbound + returns mailto for ApplicationStatus@elavon.com (AWB in subject)
 *   refreshAwbFromMsp — { corporateId, midId } — GET MSP status+application, persist elavonAwb
 *
 * Never expose to merchant portal tokens.
 * Gmail sync of underwriting@ lives in syncUnderwritingMail (separate function).
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

function parseEntities(raw: unknown): any[] {
  let v: any = raw ?? [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { v = []; }
  }
  return Array.isArray(v) ? v : [];
}

// --- BEGIN extractElavonAwb (sync with helpers/extractElavonAwb.ts) ---
function extractElavonAwb(...payloads: unknown[]): string | null {
  for (const payload of payloads) {
    const found = walkForAwb(payload, 0);
    if (found) return found;
  }
  return null;
}
const AWB_KEY_RE = /^(awb|elavon_?awb|application_?work_?basket|work_?basket(_?id|_?no|_?number)?|boarding_?id|processor_?(ref|reference|application_?id)|elavon_?(ref|reference|app(lication)?_?id))$/i;
function walkForAwb(node: unknown, depth: number): string | null {
  if (node == null || depth > 8) return null;
  if (typeof node === 'string' || typeof node === 'number') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const f = walkForAwb(item, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (AWB_KEY_RE.test(k) && (typeof v === 'string' || typeof v === 'number')) {
      const s = String(v).trim();
      if (s && s.length >= 4 && s.length <= 32) return s;
    }
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') {
      const m = v.match(/\bAWB\s*[:#]?\s*([A-Z0-9-]{4,24})\b/i);
      if (m?.[1]) return m[1];
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const f = walkForAwb(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}
// --- END extractElavonAwb ---

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await getPortalActor(req, base44);
    if (!actor || actor.actor !== 'admin') {
      return Response.json({ error: 'Unauthorized — Deal Room is admin-only' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'get');
    const corporateId = String(body.corporateId || '').trim();
    if (!corporateId) {
      return Response.json({ error: 'corporateId required' }, { status: 400 });
    }

    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
      { corporateId }, '-created_date', 1
    );
    const profile = profiles?.[0] || null;
    if (!profile) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }

    const me = await base44.auth.me().catch(() => null);
    const authorEmail = me?.email || me?.full_name || 'agent';
    const authorName = me?.full_name || me?.email || 'Agent';

    // ── get ──────────────────────────────────────────────────────────────────
    if (action === 'get') {
      let account: any = null;
      if (profile.merchantAccountId) {
        try {
          account = await base44.asServiceRole.entities.MerchantAccount.get(String(profile.merchantAccountId));
        } catch {
          account = null;
        }
      }

      const [mids, signers, locations, deskRaw, uwRaw] = await Promise.all([
        base44.asServiceRole.entities.MerchantMID.filter({ corporateId }, '-created_date', 100),
        base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }, '-created_date', 50),
        base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }, '-created_date', 50),
        base44.asServiceRole.entities.ApplicationDeskItem.filter({ corporateId }, '-created_date', 200).catch(() => []),
        base44.asServiceRole.entities.UnderwritingMessage.filter({ corporateId }, '-created_date', 300).catch(() => []),
      ]);

      const legalEntities = account
        ? parseEntities(account.legalEntities)
        : parseEntities(profile.legalEntities);

      const items = (deskRaw || []).slice().sort((a: any, b: any) => {
        const ta = new Date(a.created_date || a.createdAt || 0).getTime();
        const tb = new Date(b.created_date || b.createdAt || 0).getTime();
        return tb - ta;
      });

      const uwMessages = (uwRaw || []).slice().sort((a: any, b: any) => {
        const ta = new Date(a.messageDate || a.created_date || 0).getTime();
        const tb = new Date(b.messageDate || b.created_date || 0).getTime();
        return tb - ta;
      });

      return Response.json({
        success: true,
        corporateId,
        profile,
        account,
        legalEntities,
        mids: mids || [],
        signers: signers || [],
        locations: locations || [],
        notes: items.filter((i: any) => i.type === 'note'),
        tasks: items.filter((i: any) => i.type === 'task'),
        items,
        uwMessages,
        gmailSyncConfigured: !!(
          Deno.env.get('UNDERWRITING_GMAIL_REFRESH_TOKEN')
          || Deno.env.get('UNDERWRITING_GMAIL_ACCESS_TOKEN')
        ),
      });
    }

    // ── addNote ──────────────────────────────────────────────────────────────
    if (action === 'addNote') {
      const text = String(body.body || '').trim();
      if (!text) return Response.json({ error: 'body required' }, { status: 400 });
      let item;
      try {
        item = await base44.asServiceRole.entities.ApplicationDeskItem.create({
          corporateId,
          merchantAccountId: profile.merchantAccountId || '',
          type: 'note',
          body: text,
          authorEmail,
          authorName,
          status: 'open',
        });
      } catch (e: any) {
        return Response.json({
          error: 'ApplicationDeskItem entity missing — republish schema in Base44, then retry.',
          detail: e?.message,
        }, { status: 503 });
      }
      return Response.json({ success: true, item });
    }

    // ── addTask ──────────────────────────────────────────────────────────────
    if (action === 'addTask') {
      const text = String(body.body || '').trim();
      if (!text) return Response.json({ error: 'body required' }, { status: 400 });
      let item;
      try {
        item = await base44.asServiceRole.entities.ApplicationDeskItem.create({
          corporateId,
          merchantAccountId: profile.merchantAccountId || '',
          type: 'task',
          body: text,
          authorEmail,
          authorName,
          status: 'open',
          assignee: String(body.assignee || '').trim(),
          dueAt: String(body.dueAt || '').trim(),
        });
      } catch (e: any) {
        return Response.json({
          error: 'ApplicationDeskItem entity missing — republish schema in Base44, then retry.',
          detail: e?.message,
        }, { status: 503 });
      }
      return Response.json({ success: true, item });
    }

    // ── updateTask ───────────────────────────────────────────────────────────
    if (action === 'updateTask') {
      const itemId = String(body.itemId || '').trim();
      if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 });
      let existing;
      try {
        existing = await base44.asServiceRole.entities.ApplicationDeskItem.get(itemId);
      } catch {
        return Response.json({ error: 'Item not found' }, { status: 404 });
      }
      if (!existing || String(existing.corporateId) !== corporateId) {
        return Response.json({ error: 'Item not found for this deal' }, { status: 404 });
      }
      if (existing.type !== 'task') {
        return Response.json({ error: 'Only tasks can be updated this way' }, { status: 400 });
      }
      const patch: Record<string, unknown> = {};
      if (body.body !== undefined) patch.body = String(body.body).trim();
      if (body.assignee !== undefined) patch.assignee = String(body.assignee).trim();
      if (body.dueAt !== undefined) patch.dueAt = String(body.dueAt).trim();
      if (body.status === 'done' || body.status === 'open') {
        patch.status = body.status;
        if (body.status === 'done') {
          patch.completedAt = new Date().toISOString();
          patch.completedByEmail = authorEmail;
        } else {
          patch.completedAt = '';
          patch.completedByEmail = '';
        }
      }
      const updated = await base44.asServiceRole.entities.ApplicationDeskItem.update(itemId, patch);
      return Response.json({ success: true, item: updated });
    }

    // ── deleteItem ───────────────────────────────────────────────────────────
    if (action === 'deleteItem') {
      const itemId = String(body.itemId || '').trim();
      if (!itemId) return Response.json({ error: 'itemId required' }, { status: 400 });
      let existing;
      try {
        existing = await base44.asServiceRole.entities.ApplicationDeskItem.get(itemId);
      } catch {
        return Response.json({ error: 'Item not found' }, { status: 404 });
      }
      if (!existing || String(existing.corporateId) !== corporateId) {
        return Response.json({ error: 'Item not found for this deal' }, { status: 404 });
      }
      await base44.asServiceRole.entities.ApplicationDeskItem.delete(itemId);
      return Response.json({ success: true });
    }

    // ── setMidAwb — admin can set AWB even when MID boarding status is locked ─
    if (action === 'setMidAwb') {
      const midId = String(body.midId || '').trim();
      if (!midId) return Response.json({ error: 'midId required' }, { status: 400 });
      let mid;
      try {
        mid = await base44.asServiceRole.entities.MerchantMID.get(midId);
      } catch {
        return Response.json({ error: 'MID not found' }, { status: 404 });
      }
      if (!mid || String(mid.corporateId) !== corporateId) {
        return Response.json({ error: 'MID not found for this deal' }, { status: 404 });
      }
      const elavonAwb = String(body.elavonAwb || '').trim();
      const updated = await base44.asServiceRole.entities.MerchantMID.update(midId, { elavonAwb });
      // Backfill empty AWB on existing messages for this MID
      if (elavonAwb) {
        try {
          const msgs = await base44.asServiceRole.entities.UnderwritingMessage.filter({ midId }, '-created_date', 100);
          for (const m of (msgs || [])) {
            if (!m.elavonAwb) {
              await base44.asServiceRole.entities.UnderwritingMessage.update(m.id, { elavonAwb });
            }
          }
        } catch { /* entity may not exist yet */ }
      }
      return Response.json({ success: true, mid: updated });
    }

    // ── logUwMessage — manual / forward into per-MID thread ───────────────────
    if (action === 'logUwMessage') {
      const midId = String(body.midId || '').trim();
      const bodyText = String(body.bodyText || body.body || '').trim();
      if (!bodyText) return Response.json({ error: 'bodyText required' }, { status: 400 });

      let elavonAwb = String(body.elavonAwb || '').trim();
      if (midId) {
        try {
          const mid = await base44.asServiceRole.entities.MerchantMID.get(midId);
          if (!mid || String(mid.corporateId) !== corporateId) {
            return Response.json({ error: 'MID not found for this deal' }, { status: 404 });
          }
          if (!elavonAwb) elavonAwb = String(mid.elavonAwb || '').trim();
        } catch {
          return Response.json({ error: 'MID not found' }, { status: 404 });
        }
      }

      const direction = ['inbound', 'outbound', 'internal'].includes(body.direction)
        ? body.direction
        : 'internal';
      const subject = String(body.subject || '').trim();
      const snippet = bodyText.slice(0, 160);

      let message;
      try {
        message = await base44.asServiceRole.entities.UnderwritingMessage.create({
          corporateId,
          midId: midId || '',
          elavonAwb,
          direction,
          subject,
          bodyText,
          fromAddress: String(body.fromAddress || authorEmail).trim(),
          toAddress: String(body.toAddress || 'underwriting@cliqbux.com').trim(),
          messageDate: String(body.messageDate || new Date().toISOString()).trim(),
          externalId: String(body.externalId || '').trim(),
          source: body.source === 'forward' || body.source === 'gmail' ? body.source : 'manual',
          snippet,
        });
      } catch (e: any) {
        return Response.json({
          error: 'UnderwritingMessage entity missing — republish schema in Base44, then retry.',
          detail: e?.message,
        }, { status: 503 });
      }
      return Response.json({ success: true, message });
    }

    // ── deleteUwMessage ──────────────────────────────────────────────────────
    if (action === 'deleteUwMessage') {
      const messageId = String(body.messageId || '').trim();
      if (!messageId) return Response.json({ error: 'messageId required' }, { status: 400 });
      let existing;
      try {
        existing = await base44.asServiceRole.entities.UnderwritingMessage.get(messageId);
      } catch {
        return Response.json({ error: 'Message not found' }, { status: 404 });
      }
      if (!existing || String(existing.corporateId) !== corporateId) {
        return Response.json({ error: 'Message not found for this deal' }, { status: 404 });
      }
      await base44.asServiceRole.entities.UnderwritingMessage.delete(messageId);
      return Response.json({ success: true });
    }

    // ── requestStatusInquiry — Elavon ApplicationStatus@ with AWB in subject ─
    // Elavon (apps submitted after 2026-07-07): one AWB per email chain;
    // automated reply within minutes; no DBA/legal/MID/pend detail in auto-replies.
    if (action === 'requestStatusInquiry') {
      const midId = String(body.midId || '').trim();
      if (!midId) return Response.json({ error: 'midId required' }, { status: 400 });
      let mid;
      try {
        mid = await base44.asServiceRole.entities.MerchantMID.get(midId);
      } catch {
        return Response.json({ error: 'MID not found' }, { status: 404 });
      }
      if (!mid || String(mid.corporateId) !== corporateId) {
        return Response.json({ error: 'MID not found for this deal' }, { status: 404 });
      }
      const awb = String(mid.elavonAwb || '').trim();
      if (!awb) {
        return Response.json({
          error: 'Save an Elavon AWB on this MID before requesting status.',
          code: 'AWB_REQUIRED',
        }, { status: 422 });
      }

      const toAddress = 'ApplicationStatus@elavon.com';
      // Subject must contain the AWB — Elavon’s automation keys off the subject line.
      const subject = awb;
      const bodyText = [
        `Status inquiry for AWB ${awb}.`,
        '',
        'Sent from Cliqbux Deal Room. Please reply in this thread.',
        `(Automated replies do not include DBA, legal name, MID, or data-entry pends.)`,
      ].join('\n');

      let message = null;
      try {
        message = await base44.asServiceRole.entities.UnderwritingMessage.create({
          corporateId,
          midId,
          elavonAwb: awb,
          direction: 'outbound',
          subject,
          bodyText,
          fromAddress: authorEmail,
          toAddress,
          messageDate: new Date().toISOString(),
          externalId: '',
          source: 'manual',
          snippet: `Status inquiry → ApplicationStatus@elavon.com · AWB ${awb}`.slice(0, 160),
        });
      } catch (e: any) {
        return Response.json({
          error: 'UnderwritingMessage entity missing — republish schema in Base44, then retry.',
          detail: e?.message,
        }, { status: 503 });
      }

      const mailto = `mailto:${encodeURIComponent(toAddress)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
      const escalationMailtoMsp = `mailto:MSPFulSer@elavon.com?subject=${encodeURIComponent(`Escalation AWB ${awb}`)}`;
      const escalationMailtoFul = `mailto:FulSerCenter@elavon.com?subject=${encodeURIComponent(`Escalation AWB ${awb}`)}`;

      return Response.json({
        success: true,
        message,
        mailto,
        toAddress,
        subject,
        awb,
        escalation: {
          mspFulSer: escalationMailtoMsp,
          fulSerCenter: escalationMailtoFul,
        },
        hint: 'One AWB per email chain. Open mailto from underwriting@cliqbux.com, then Sync inbox for the automated reply.',
      });
    }

    // ── refreshAwbFromMsp — pull AWB from MSPWare for this MID ────────────────
    if (action === 'refreshAwbFromMsp') {
      const midId = String(body.midId || '').trim();
      if (!midId) return Response.json({ error: 'midId required' }, { status: 400 });
      let mid;
      try {
        mid = await base44.asServiceRole.entities.MerchantMID.get(midId);
      } catch {
        return Response.json({ error: 'MID not found' }, { status: 404 });
      }
      if (!mid || String(mid.corporateId) !== corporateId) {
        return Response.json({ error: 'MID not found for this deal' }, { status: 404 });
      }
      const appNo = String(mid.mspApplicationNo || '').trim();
      if (!appNo) {
        return Response.json({
          error: 'No MSPWare application number on this MID — submit to Elavon first.',
          code: 'NO_MSP_APP',
        }, { status: 422 });
      }

      const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
      const apiKey = Deno.env.get('MSP_APP_KEY') || '';
      const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
      if (!apiKey) return Response.json({ error: 'MSP_APP_KEY not set' }, { status: 500 });
      const mspHeaders = { 'X-API-KEY': apiKey, 'X-App-ID': appId, Accept: 'application/json' };

      const [stRes, appRes] = await Promise.all([
        fetch(`${mspBase}/applications/${appNo}/status`, { headers: mspHeaders }),
        fetch(`${mspBase}/applications/${appNo}`, { headers: mspHeaders }),
      ]);
      const statusData = stRes.ok ? await stRes.json().catch(() => null) : null;
      const appData = appRes.ok ? await appRes.json().catch(() => null) : null;
      const elavonAwb = extractElavonAwb(statusData, appData, appData?.application);
      const currentState = String(statusData?.currentState || statusData?.status || '').toUpperCase() || null;

      if (!elavonAwb) {
        return Response.json({
          success: false,
          found: false,
          mspApplicationNo: appNo,
          currentState,
          statusHttp: stRes.status,
          appHttp: appRes.status,
          statusKeys: statusData && typeof statusData === 'object' ? Object.keys(statusData) : [],
          applicationKeys: appData?.application && typeof appData.application === 'object'
            ? Object.keys(appData.application)
            : (appData && typeof appData === 'object' ? Object.keys(appData) : []),
          hint: 'AWB not found on MSP payload yet — confirm field name via debugMSPFormRaw / live status after submit. Manual paste still works.',
        });
      }

      const updated = await base44.asServiceRole.entities.MerchantMID.update(midId, { elavonAwb });
      return Response.json({
        success: true,
        found: true,
        elavonAwb,
        currentState,
        mid: updated,
        mspApplicationNo: appNo,
      });
    }

    return Response.json({
      error: 'Unknown action',
      hint: 'Expected get | addNote | addTask | updateTask | deleteItem | setMidAwb | logUwMessage | deleteUwMessage | requestStatusInquiry | refreshAwbFromMsp',
    }, { status: 400 });
  } catch (error: any) {
    console.error('[manageApplicationDesk]', error?.message);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
