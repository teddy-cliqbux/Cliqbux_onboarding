import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
// Extended here to surface JWT email for authorizedUserEmail audit field.
function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getPortalActor(
  req: Request,
  base44: any
): Promise<{ actor: 'merchant' | 'admin'; corporateId?: string; email?: string } | null> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const ok = await crypto.subtle.verify(
        'HMAC',
        key,
        __b64uDecode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
      );
      if (ok) {
        const payload = JSON.parse(new TextDecoder().decode(__b64uDecode(parts[1])));
        if (payload.corporateId && typeof payload.exp === 'number' && Date.now() < payload.exp * 1000) {
          return {
            actor: 'merchant',
            corporateId: String(payload.corporateId),
            email: payload.email ? String(payload.email) : undefined,
          };
        }
      }
    }
  } catch { /* invalid merchant token — fall through to workspace check */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin', email: user.email ? String(user.email) : undefined };
  } catch { /* no workspace session */ }
  return null;
}

const ALLOWED_METHODS = new Set(['oauth', 'access_account', 'credential_vault']);
const ALLOWED_PROVIDERS = new Set(['clover', 'square', 'lightspeed', 'shopify', 'toast', 'other']);

function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for') || req.headers.get('X-Forwarded-For') || '';
  if (xf) return xf.split(',')[0].trim().slice(0, 128);
  const cf = req.headers.get('cf-connecting-ip') || req.headers.get('CF-Connecting-IP') || '';
  if (cf) return cf.trim().slice(0, 128);
  const real = req.headers.get('x-real-ip') || '';
  if (real) return real.trim().slice(0, 128);
  return 'unknown';
}

// ─── submitLegacyPOSConnection ────────────────────────────────────────────────
// Secure write path for Connect Legacy POS (OAuth intent / access-account /
// encrypted credential vault). Rejects any plaintext password field.
//
// POST body (credential_vault):
//   { corporateId, connectionMethod, provider, username, passwordCiphertext,
//     consentAccepted, consentTextVersion, consentTimestamp }
// NEVER send { password: "..." } — returns 400.

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Absolute: never accept plaintext passwords
    if (
      Object.prototype.hasOwnProperty.call(body, 'password') ||
      Object.prototype.hasOwnProperty.call(body, 'adminPassword') ||
      Object.prototype.hasOwnProperty.call(body, 'plainPassword')
    ) {
      return Response.json(
        { error: 'Plaintext password fields are forbidden. Encrypt client-side and send passwordCiphertext only.' },
        { status: 400 }
      );
    }

    const bodyCorporateId = body.corporateId != null ? String(body.corporateId) : '';
    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (actor.actor === 'merchant') {
      if (!bodyCorporateId || actor.corporateId !== bodyCorporateId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const corporateId = actor.actor === 'merchant' ? String(actor.corporateId) : bodyCorporateId;
    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });

    const connectionMethod = String(body.connectionMethod || '');
    const provider = String(body.provider || '').toLowerCase();
    if (!ALLOWED_METHODS.has(connectionMethod)) {
      return Response.json({ error: 'Invalid connectionMethod' }, { status: 400 });
    }
    if (!ALLOWED_PROVIDERS.has(provider)) {
      return Response.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Derive audit fields server-side — never trust client for these
    let authorizedUserEmail = actor.email || '';
    if (!authorizedUserEmail) {
      try {
        const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }) || [];
        authorizedUserEmail = profiles[0]?.signerEmail || '';
      } catch { /* leave blank */ }
    }
    const ipAddress = clientIp(req);

    const record: Record<string, any> = {
      corporateId,
      connectionMethod,
      provider,
      status: 'pending_review',
      authorizedUserEmail: authorizedUserEmail || 'unknown',
      ipAddress,
    };

    if (connectionMethod === 'oauth') {
      record.notes = body.notes || 'OAuth intent — Coming Soon coordination requested';
      record.consentAccepted = false;
    } else if (connectionMethod === 'access_account') {
      record.notes = body.notes || 'Merchant confirmed accounts@cliqbux.com invite path';
      record.consentAccepted = false;
    } else if (connectionMethod === 'credential_vault') {
      const username = String(body.username || '').trim();
      const passwordCiphertext = String(body.passwordCiphertext || '').trim();
      const consentAccepted = body.consentAccepted === true;
      const consentTextVersion = String(body.consentTextVersion || '').trim();
      const consentTimestamp = String(body.consentTimestamp || '').trim();

      if (!username) return Response.json({ error: 'username required' }, { status: 400 });
      if (!passwordCiphertext) {
        return Response.json({ error: 'passwordCiphertext required' }, { status: 400 });
      }
      if (!consentAccepted) {
        return Response.json({ error: 'Legal consent waiver must be accepted' }, { status: 400 });
      }
      if (!consentTextVersion || !consentTimestamp) {
        return Response.json({ error: 'consentTextVersion and consentTimestamp required' }, { status: 400 });
      }

      record.username = username.slice(0, 256);
      record.passwordCiphertext = passwordCiphertext.slice(0, 8192);
      record.consentAccepted = true;
      record.consentTextVersion = consentTextVersion.slice(0, 64);
      record.consentTimestamp = consentTimestamp.slice(0, 64);
    }

    let created;
    try {
      created = await base44.asServiceRole.entities.MerchantPOSConnection.create(record);
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/not found in app/i.test(msg) || /MerchantPOSConnection/i.test(msg) && /not found/i.test(msg)) {
        return Response.json({
          error: 'Entity schema MerchantPOSConnection not found in app. Publish MerchantPOSConnection in Base44 (see docs/legacy-pos-schemas.md), then retry.',
          code: 'ENTITY_SCHEMA_MISSING',
        }, { status: 503 });
      }
      throw e;
    }

    console.log(
      `[submitLegacyPOSConnection] corporateId=${corporateId} method=${connectionMethod} provider=${provider} status=pending_review`
    );

    return Response.json({
      success: true,
      id: created.id,
      status: 'pending_review',
      connectionMethod,
      provider,
    });
  } catch (error: any) {
    console.error('[submitLegacyPOSConnection]', error.message);
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
