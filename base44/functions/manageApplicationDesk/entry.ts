/**
 * manageApplicationDesk — admin-only Deal Room notes/tasks + snapshot.
 *
 * Actions:
 *   get        — profile + account + mids + signers + locations + desk items
 *   addNote    — { corporateId, body }
 *   addTask    — { corporateId, body, assignee?, dueAt? }
 *   updateTask — { corporateId, itemId, status?, body?, assignee?, dueAt? }
 *   deleteItem — { corporateId, itemId }
 *
 * Never expose to merchant portal tokens.
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

      const [mids, signers, locations, deskRaw] = await Promise.all([
        base44.asServiceRole.entities.MerchantMID.filter({ corporateId }, '-created_date', 100),
        base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }, '-created_date', 50),
        base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }, '-created_date', 50),
        base44.asServiceRole.entities.ApplicationDeskItem.filter({ corporateId }, '-created_date', 200).catch(() => []),
      ]);

      const legalEntities = account
        ? parseEntities(account.legalEntities)
        : parseEntities(profile.legalEntities);

      const items = (deskRaw || []).slice().sort((a: any, b: any) => {
        const ta = new Date(a.created_date || a.createdAt || 0).getTime();
        const tb = new Date(b.created_date || b.createdAt || 0).getTime();
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

    return Response.json({
      error: 'Unknown action',
      hint: 'Expected get | addNote | addTask | updateTask | deleteItem',
    }, { status: 400 });
  } catch (error: any) {
    console.error('[manageApplicationDesk]', error?.message);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
