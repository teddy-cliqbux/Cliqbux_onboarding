import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// manageStagedApplication — CRUD for StagedApplication records
// Actions:
//   validate                                — PUBLIC: merchant proves possession of the
//                                             staged-link token; returns a signed merchant
//                                             JWT + a sanitized stage record
//   trackProgress                           — merchant token (matching corporateId) or admin
//   impersonate                             — ADMIN ONLY: mint a 30-min merchant JWT so sales
//                                             can open the live portal and Save on behalf of
//                                             the merchant. Never returns stage accessToken.
//   getInviteLink                           — ADMIN ONLY: return the staged magic link once
//                                             (avoids leaking accessToken via list/get)
//   list, get, create, update, delete, send — ADMIN ONLY (Base44 workspace session)
//                                             list/get responses are sanitized (no accessToken)
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

const ACTIVITY_RECENT_MAX = 25;

function emptyActivity() {
  return {
    invitesSent: 0,
    lastInviteAt: null as string | null,
    lastInviteEmail: '',
    merchantOpens: 0,
    merchantLastOpenAt: null as string | null,
    merchantSeconds: 0,
    agentOpens: 0,
    agentLastOpenAt: null as string | null,
    agentSeconds: 0,
    recent: [] as Array<{ type: string; at: string; actor?: string; detail?: string }>,
  };
}

/** Merge a single activityEvent into the auto-track activity blob. */
function applyActivityEvent(prevActivity: any, event: any) {
  const a = { ...emptyActivity(), ...(prevActivity && typeof prevActivity === 'object' ? prevActivity : {}) };
  const at = new Date().toISOString();
  const type = String(event?.type || '');
  const actor = event?.actor === 'agent' ? 'agent' : 'merchant';
  const push = (detail?: string) => {
    const recent = [{ type, at, actor, detail: detail || undefined }, ...(Array.isArray(a.recent) ? a.recent : [])];
    a.recent = recent.slice(0, ACTIVITY_RECENT_MAX);
  };

  if (type === 'invite_sent') {
    a.invitesSent = (a.invitesSent || 0) + 1;
    a.lastInviteAt = at;
    if (event?.email) a.lastInviteEmail = String(event.email);
    push(event?.email ? String(event.email) : undefined);
  } else if (type === 'portal_open') {
    if (actor === 'agent') {
      a.agentOpens = (a.agentOpens || 0) + 1;
      a.agentLastOpenAt = at;
    } else {
      a.merchantOpens = (a.merchantOpens || 0) + 1;
      a.merchantLastOpenAt = at;
    }
    push();
  } else if (type === 'session_tick') {
    const secs = Math.max(0, Math.min(300, Number(event?.seconds) || 0)); // cap 5 min per tick
    if (secs > 0) {
      if (actor === 'agent') a.agentSeconds = (a.agentSeconds || 0) + secs;
      else a.merchantSeconds = (a.merchantSeconds || 0) + secs;
    }
    // ticks are frequent — don't spam recent[]
  }
  return a;
}

/** Upsert __auto_track__ for a corporateId, merging prefill patch + optional activityEvent. */
async function upsertAutoTrack(base44: any, corporateId: string, prefillPatch: Record<string, any> = {}, activityEvent?: any) {
  const existing = await base44.asServiceRole.entities.StagedApplication.filter(
    { corporateId, label: '__auto_track__' }, '-created_date', 1
  );
  const prev = (existing[0]?.prefilledData && typeof existing[0].prefilledData === 'object')
    ? existing[0].prefilledData
    : {};
  const activity = activityEvent
    ? applyActivityEvent(prev.activity, activityEvent)
    : (prev.activity || emptyActivity());

  const mergedPrefill = {
    currentStep: prev.currentStep || 'locations',
    completedSteps: prev.completedSteps || {},
    ...prev,
    ...prefillPatch,
    activity,
    lastSeenAt: prefillPatch.lastSeenAt || prev.lastSeenAt || new Date().toISOString(),
  };
  const trackData: any = {
    corporateId,
    label: '__auto_track__',
    status: 'draft',
    prefilledData: mergedPrefill,
  };
  if (existing.length > 0) {
    return base44.asServiceRole.entities.StagedApplication.update(existing[0].id, trackData);
  }
  const token = generateToken();
  return base44.asServiceRole.entities.StagedApplication.create({ ...trackData, accessToken: token });
}

// --- email brand (copied from helpers/emailBrand.ts — Base44 cannot import helpers) ---
const CLIQBUX_EMAIL_LOGO_CID = 'cliqbux-logo';
const CLIQBUX_EMAIL_LOGO_B64 = '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';
function emailLogoHeaderHtml(): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin:0 auto;">
  <tr>
    <td style="padding:0 12px 0 0;vertical-align:middle;">
      <img src="cid:${CLIQBUX_EMAIL_LOGO_CID}" width="28" height="31" alt="Cliqbux" style="display:block;border:0;outline:none;text-decoration:none;width:28px;height:31px;" />
    </td>
    <td style="vertical-align:middle;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.03em;font-family:Poppins,Inter,Arial,sans-serif;line-height:1;">cliqbux</td>
  </tr>
</table>`;
}
function resendInlineLogoAttachment() {
  return {
    filename: 'cliqbux-mark.png',
    content: CLIQBUX_EMAIL_LOGO_B64,
    content_id: CLIQBUX_EMAIL_LOGO_CID,
  };
}
// --- end email brand ---

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
    // Only fields present in `data` are written — omit currentStep/completedSteps
    // on heartbeat opens so we never rewind a merchant who already advanced.
    // Optional data.activityEvent: { type, actor?, seconds?, email? }
    if (action === 'trackProgress') {
      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
      if (actor.actor === 'merchant' && actor.corporateId !== String(corporateId)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const patch: Record<string, any> = {
        lastSeenAt: new Date().toISOString(),
      };
      if (data?.currentStep != null && data.currentStep !== '') patch.currentStep = data.currentStep;
      if (data?.completedSteps != null && typeof data.completedSteps === 'object') {
        // completedSteps merge happens inside upsert after load — pass through; upsert merges shallowly
        // so we re-merge properly here via a flag: store as completedStepsPatch
        patch._completedStepsPatch = data.completedSteps;
      }
      if (data?.merchantName != null) patch.merchantName = data.merchantName;
      if (data?.signerEmail != null) patch.signerEmail = data.signerEmail;
      if (data?.pricingTier != null) patch.pricingTier = data.pricingTier;
      if (data?.applicationStatus != null) patch.applicationStatus = data.applicationStatus;
      if (data?.missingByStep != null) patch.missingByStep = data.missingByStep;

      // Merchants may only log merchant-actor events (not spoof agent)
      let activityEvent = data?.activityEvent || null;
      if (activityEvent && actor.actor === 'merchant') {
        activityEvent = { ...activityEvent, actor: 'merchant' };
      }

      // Load prev for completedSteps deep-merge
      const existing = await base44.asServiceRole.entities.StagedApplication.filter(
        { corporateId, label: '__auto_track__' }, '-created_date', 1
      );
      const prev = (existing[0]?.prefilledData && typeof existing[0].prefilledData === 'object')
        ? existing[0].prefilledData
        : {};
      if (patch._completedStepsPatch) {
        patch.completedSteps = { ...(prev.completedSteps || {}), ...patch._completedStepsPatch };
        delete patch._completedStepsPatch;
      }

      const updated = await upsertAutoTrack(base44, String(corporateId), patch, activityEvent);
      return Response.json({ success: true, stage: sanitizeStage(updated) });
    }

    // ── Everything below is ADMIN ONLY ───────────────────────────────────────
    if (actor.actor !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── impersonate — mint a short-lived merchant JWT for live sales guidance ─
    // Opens the real portal with Saves enabled. Never returns stage accessToken.
    if (action === 'impersonate') {
      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
        { corporateId: String(corporateId) }, '-created_date', 1
      );
      if (!profiles.length) {
        return Response.json({ error: 'Merchant not found' }, { status: 404 });
      }
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const merchantToken = await signMerchantToken(
        String(corporateId),
        profiles[0].signerEmail || undefined,
        expiresAt
      );
      const portalUrl = `${publicUrl}/?corporateId=${encodeURIComponent(String(corporateId))}&impersonateToken=${encodeURIComponent(merchantToken)}`;
      return Response.json({ success: true, merchantToken, expiresAt, portalUrl });
    }

    // ── getInviteLink — return the staged magic link without listing tokens ───
    if (action === 'getInviteLink') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const stage = await base44.asServiceRole.entities.StagedApplication.get(stageId);
      if (!stage) return Response.json({ error: 'Stage not found' }, { status: 404 });
      if (stage.label === '__auto_track__') {
        return Response.json({ error: 'Cannot invite via auto-track record' }, { status: 400 });
      }
      if (!stage.accessToken) {
        return Response.json({ error: 'Stage has no invite token' }, { status: 400 });
      }
      return Response.json({
        success: true,
        link: `${publicUrl}/?stageId=${stage.id}&token=${stage.accessToken}`,
      });
    }

    if (action === 'list') {
      // List all staged apps for a corporateId (or all if no filter given).
      // accessToken is stripped — use getInviteLink when an admin needs the URL.
      const filter: any = {};
      if (corporateId) filter.corporateId = corporateId;
      const stages = await base44.asServiceRole.entities.StagedApplication.filter(filter, '-created_date', 100);
      return Response.json({ success: true, stages: stages.map(sanitizeStage) });
    }

    if (action === 'get') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const stage = await base44.asServiceRole.entities.StagedApplication.get(stageId);
      return Response.json({ success: true, stage: sanitizeStage(stage) });
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
      return Response.json({ success: true, stage: sanitizeStage(stage) });
    }

    if (action === 'update') {
      if (!stageId) return Response.json({ error: 'stageId required' }, { status: 400 });
      const updated = await base44.asServiceRole.entities.StagedApplication.update(stageId, data);
      return Response.json({ success: true, stage: sanitizeStage(updated) });
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
  <div style="margin-bottom: 24px;text-align:center;">${emailLogoHeaderHtml()}</div>
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
          attachments: [resendInlineLogoAttachment()],
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

      await upsertAutoTrack(
        base44,
        String(stage.corporateId),
        {},
        { type: 'invite_sent', actor: 'agent', email: toEmail }
      ).catch(() => null);

      return Response.json({ success: true, stage: sanitizeStage(updated), link });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
