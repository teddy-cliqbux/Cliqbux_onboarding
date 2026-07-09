import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// manageStagedApplication — CRUD for StagedApplication records
// Actions:
//   validate                                — PUBLIC: merchant proves possession of the
//                                             staged-link token; returns a signed merchant
//                                             JWT + a sanitized stage record
//   trackProgress                           — merchant token (matching corporateId) or admin
//   list, get, create, update, delete, send — ADMIN ONLY (Base44 workspace session)
// POST /functions/manageStagedApplication

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getHmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const secret = Deno.env.get('MERCHANT_JWT_SECRET');
  if (!secret) throw new Error('MERCHANT_JWT_SECRET env var not set');
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function signMerchantToken(corporateId: string, email: string | undefined, expiresAt: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000);
  const payload = { corporateId, email, exp };
  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await getHmacKey('sign');
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
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

function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Strip the fields a merchant must never see (accessToken most of all —
// returning it would let anyone holding a stageId mint a valid link).
function sanitizeStage(stage: any) {
  if (!stage) return stage;
  const { accessToken: _accessToken, ...safe } = stage;
  return safe;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, stageId, corporateId, data } = body;

    const publicUrl = (Deno.env.get('PUBLIC_APP_URL') || 'https://onboarding.cliqbux.com').replace(/\/$/, '');

    // ── validate — the ONLY public action ────────────────────────────────────
    // The merchant proves possession of the emailed link token; the comparison
    // happens server-side (the token is never returned to the client). On
    // success we mint a merchant JWT so every subsequent portal call is
    // authenticated, exactly like validateResumeToken does for resume links.
    if (action === 'validate') {
      const token = data?.token || body.token;
      if (!stageId || !token) return Response.json({ error: 'stageId and token required' }, { status: 400 });

      const stage = await base44.asServiceRole.entities.StagedApplication.get(stageId).catch(() => null);
      if (!stage || !stage.accessToken || stage.accessToken !== token) {
        return Response.json({ success: false, error: 'Invalid or expired link' }, { status: 401 });
      }

      // Staged links don't expire themselves; the session token they mint is
      // good for 7 days. Revisiting the link mints a fresh one.
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const merchantToken = await signMerchantToken(String(stage.corporateId), stage.sentToEmail, expiresAt);

      return Response.json({ success: true, stage: sanitizeStage(stage), merchantToken });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── trackProgress — merchant (own corporateId) or admin ──────────────────
    // Auto-upserts a tracking record when a merchant opens/advances the portal.
    if (action === 'trackProgress') {
      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
      if (actor.actor === 'merchant' && actor.corporateId !== String(corporateId)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Find existing auto-tracking record for this merchant (label = '__auto_track__')
      const existing = await base44.asServiceRole.entities.StagedApplication.filter(
        { corporateId, label: '__auto_track__' }, '-created_date', 1
      );

      const trackData: any = {
        corporateId,
        label: '__auto_track__',
        status: 'draft',
        prefilledData: {
          currentStep: data?.currentStep || 'agreement',
          completedSteps: data?.completedSteps || {},
          merchantName: data?.merchantName || '',
          signerEmail: data?.signerEmail || '',
          pricingTier: data?.pricingTier || '',
          applicationStatus: data?.applicationStatus || '',
          lastSeenAt: new Date().toISOString(),
        },
      };

      if (existing.length > 0) {
        // Merge with existing prefilledData so we don't overwrite fields not sent this call
        const prev = existing[0].prefilledData || {};
        trackData.prefilledData = { ...prev, ...trackData.prefilledData };
        const updated = await base44.asServiceRole.entities.StagedApplication.update(existing[0].id, trackData);
        return Response.json({ success: true, stage: sanitizeStage(updated) });
      } else {
        const token = generateToken();
        const created = await base44.asServiceRole.entities.StagedApplication.create({ ...trackData, accessToken: token });
        return Response.json({ success: true, stage: sanitizeStage(created) });
      }
    }

    // ── Everything below is ADMIN ONLY ───────────────────────────────────────
    if (actor.actor !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'list') {
      // List all staged apps for a corporateId (or all if no filter given)
      const filter: any = {};
      if (corporateId) filter.corporateId = corporateId;
      const stages = await base44.asServiceRole.entities.StagedApplication.filter(filter, '-created_date', 100);
      return Response.json({ success: true, stages });
    }

    if (action === 'get') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const stage = await base44.asServiceRole.entities.StagedApplication.get(stageId);
      return Response.json({ success: true, stage });
    }

    if (action === 'create') {
      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
      const token = generateToken();
      const stage = await base44.asServiceRole.entities.StagedApplication.create({
        corporateId,
        status: 'draft',
        label: data?.label || 'New Staged Application',
        includedLocationIds: data?.includedLocationIds || [],
        includedMidIds: data?.includedMidIds || [],
        includedSignerIds: data?.includedSignerIds || [],
        prefilledData: data?.prefilledData || {},
        accessToken: token,
      });
      return Response.json({ success: true, stage });
    }

    if (action === 'update') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const updated = await base44.asServiceRole.entities.StagedApplication.update(stageId, data);
      return Response.json({ success: true, stage: updated });
    }

    if (action === 'delete') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      await base44.asServiceRole.entities.StagedApplication.delete(stageId);
      return Response.json({ success: true });
    }

    if (action === 'send') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const stage = await base44.asServiceRole.entities.StagedApplication.get(stageId);
      if (!stage) return Response.json({ error: 'Stage not found' }, { status: 404 });
      // Never send __auto_track__ records as invite links — they are internal progress trackers
      if (stage.label === '__auto_track__') return Response.json({ error: 'Cannot send an auto-tracking record as an invite link. Create a dedicated staged application for this merchant.' }, { status: 400 });

      const toEmail = data?.email || stage.sentToEmail;
      if (!toEmail) return Response.json({ error: 'email required' }, { status: 400 });

      const link = `${publicUrl}/?stageId=${stage.id}&token=${stage.accessToken}`;

      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

      const emailHtml = `
<div style="font-family: Inter, sans-serif; background: #111318; color: #e5e7eb; padding: 40px; max-width: 600px; margin: 0 auto; border-radius: 16px;">
  <div style="margin-bottom: 24px;">
    <span style="font-size: 24px; font-weight: 800; color: #f0ad4e;">cliqbux</span>
  </div>
  <h2 style="font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">Your merchant application is ready</h2>
  <p style="color: #9ca3af; margin-bottom: 24px;">Click the button below to complete your onboarding. The link is secure and unique to your account.</p>
  <a href="${link}" style="display: inline-block; background: #f0ad4e; color: #000; font-weight: 700; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-size: 15px;">
    Complete My Application →
  </a>
  <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">If you did not expect this email, you can ignore it. Questions? Reply to this email.</p>
</div>`.trim();

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Cliqbux Onboarding <onboarding@onboarding.cliqbuxpos.com>',
          to: [toEmail],
          subject: 'Your Cliqbux Merchant Application',
          html: emailHtml,
        }),
      });
      if (!emailRes.ok) {
        const errBody = await emailRes.json().catch(() => ({})) as any;
        throw new Error(`Email send failed (${emailRes.status}): ${errBody?.message || JSON.stringify(errBody)}`);
      }

      const updated = await base44.asServiceRole.entities.StagedApplication.update(stageId, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        sentToEmail: toEmail,
      });

      return Response.json({ success: true, stage: updated, link });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
