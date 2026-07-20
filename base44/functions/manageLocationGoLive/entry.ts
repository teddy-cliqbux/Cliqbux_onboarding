/**
 * manageLocationGoLive — logo, hours, installation date, installer chat.
 *
 * Actions:
 *   update       — { corporateId, locationId, logoUrl?, businessHours?, installationDate? }
 *   listMessages — { corporateId, locationId }
 *   sendMessage  — { corporateId, locationId, body }
 *
 * Installer messages stored as MerchantInstallerMessage (republish schema in Base44).
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const actor = await getPortalActor(req, base44);
    if (!actor) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'update');
    const corporateId = String(body.corporateId || '').trim();
    const locationId = String(body.locationId || '').trim();
    if (!corporateId || !locationId) {
      return Response.json({ error: 'corporateId and locationId required' }, { status: 400 });
    }
    if (actor.actor === 'merchant' && actor.corporateId !== corporateId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const locs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId });
    const loc = (locs || []).find((l: any) => String(l.id) === locationId);
    if (!loc) {
      return Response.json({ error: 'Location not found' }, { status: 404 });
    }

    if (action === 'update') {
      const patch: Record<string, string> = {};
      if (body.logoUrl !== undefined) patch.logoUrl = String(body.logoUrl || '');
      if (body.businessHours !== undefined) patch.businessHours = String(body.businessHours || '');
      if (body.installationDate !== undefined) patch.installationDate = String(body.installationDate || '');
      const updated = await base44.asServiceRole.entities.MerchantLocations.update(locationId, patch);
      return Response.json({ success: true, location: updated });
    }

    if (action === 'listMessages') {
      try {
        const messages = await base44.asServiceRole.entities.MerchantInstallerMessage.filter({
          locationId,
        });
        const sorted = (messages || []).sort((a: any, b: any) =>
          String(a.created_date || a.createdAt || '').localeCompare(String(b.created_date || b.createdAt || ''))
        );
        return Response.json({ success: true, messages: sorted });
      } catch (e: any) {
        if (/does not exist|unknown entity|MerchantInstallerMessage/i.test(String(e?.message || e))) {
          return Response.json({ success: true, messages: [], code: 'ENTITY_SCHEMA_MISSING' });
        }
        throw e;
      }
    }

    if (action === 'sendMessage') {
      const text = String(body.body || '').trim();
      if (!text) return Response.json({ error: 'body required' }, { status: 400 });
      let authorLabel = 'Merchant';
      let fromRole = 'merchant';
      if (actor.actor === 'admin') {
        fromRole = 'installer';
        try {
          const me = await base44.auth.me();
          authorLabel = me?.full_name || me?.email || 'Cliqbux';
        } catch {
          authorLabel = 'Cliqbux';
        }
      }
      try {
        const created = await base44.asServiceRole.entities.MerchantInstallerMessage.create({
          corporateId,
          locationId,
          body: text,
          fromRole,
          authorLabel,
        });
        return Response.json({ success: true, message: created });
      } catch (e: any) {
        if (/does not exist|unknown entity|MerchantInstallerMessage/i.test(String(e?.message || e))) {
          return Response.json({
            error: 'Installer chat entity not published yet. Republish MerchantInstallerMessage in Base44.',
            code: 'ENTITY_SCHEMA_MISSING',
          }, { status: 503 });
        }
        throw e;
      }
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[manageLocationGoLive]', error);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
