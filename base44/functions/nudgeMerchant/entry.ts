/**
 * nudgeMerchant — admin-only agent nudge (email via Resend + SMS via Quo).
 *
 * Body: { corporateId, channels: 'sms' | 'email' | 'both' }
 *
 * Email: resume link (pre-sign) or Verify & Sign invite to Control Person (at signing).
 * SMS: Quo v1 messages API — requires QUO_API_KEY + QUO_FROM_NUMBER env vars.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const TOKEN_TTL_DAYS = 7;
const QUO_API_VERSION = '2026-03-30';

function getPortalBaseUrl(): string {
  const configured = Deno.env.get('PUBLIC_APP_URL');
  if (configured && configured.startsWith('http')) return configured.replace(/\/$/, '');
  return 'https://cliqbux-onboard-prime.base44.app';
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(raw || '').trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
  return null;
}

const CLIQBUX_EMAIL_LOGO_CID = 'cliqbux-logo';
// Minimal 1x1 — manageSigner embeds full mark; keep payload small for nudge. Prefer cid brand if present in env later.
const CLIQBUX_EMAIL_LOGO_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function emailLogoHeaderHtml(): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin:0 auto;">
  <tr>
    <td style="vertical-align:middle;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.03em;font-family:Poppins,Inter,Arial,sans-serif;line-height:1;">cliqbux</td>
  </tr>
</table>`;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Cliqbux Onboarding <onboarding@onboarding.cliqbuxpos.com>',
      to: [to],
      subject,
      html,
      attachments: [{
        filename: 'cliqbux-mark.png',
        content: CLIQBUX_EMAIL_LOGO_B64,
        content_id: CLIQBUX_EMAIL_LOGO_CID,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

async function sendViaQuo(toE164: string, content: string): Promise<void> {
  const apiKey = Deno.env.get('QUO_API_KEY');
  const from = Deno.env.get('QUO_FROM_NUMBER');
  if (!apiKey) throw new Error('QUO_API_KEY not set — add Cliqbux Quo API key in Base44 env');
  if (!from) throw new Error('QUO_FROM_NUMBER not set — Cliqbux Quo number in E.164 (e.g. +15551234567)');

  // Prefer v1 messages (stable for SMS); fall back documented shape.
  const res = await fetch('https://api.quo.com/v1/messages', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'Quo-Api-Version': QUO_API_VERSION,
    },
    body: JSON.stringify({
      content,
      from,
      to: [toE164],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Quo SMS failed (${res.status}): ${err}`);
  }
}

function isControlPerson(s: any): boolean {
  if (!s || s.isPortalAdmin === true) return false;
  if (s.isAuthorizedSigner === true) return true;
  if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
  return false;
}

function buildNudgeEmail(firstName: string, link: string, businessName: string, intent: string): string {
  const headline = intent === 'sign'
    ? 'Your signing link is ready'
    : 'Continue your Cliqbux application';
  const body = intent === 'sign'
    ? 'Please review and sign your merchant processing agreement. It only takes a few minutes.'
    : 'Pick up where you left off — your progress is saved.';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center">
  <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;">
    <tr><td style="background:#111827;padding:28px 40px;text-align:center;">${emailLogoHeaderHtml()}</td></tr>
    <tr><td style="padding:36px 40px;">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;">${headline}</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
        Hi ${firstName || 'there'},<br><br>${body}<br><br>
        <strong>${businessName || 'Cliqbux'}</strong>
      </p>
      <a href="${link}" style="display:inline-block;background:#FEAC27;color:#111;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;">Continue →</a>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized — admin session required' }, { status: 401 });

    const body = await req.json();
    const corporateId = String(body.corporateId || '').trim();
    const channelsRaw = String(body.channels || 'both').toLowerCase();
    const channels = channelsRaw === 'sms' || channelsRaw === 'email' ? channelsRaw : 'both';

    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });

    const [profiles, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);
    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

    const control = (signers || []).find(isControlPerson)
      || (signers || []).find((s: any) => s.isPrimarySigner)
      || (signers || [])[0];

    const email = (control?.signerEmail || profile.signerEmail || '').trim().toLowerCase();
    const phone = normalizePhone(control?.corporatePhone || profile.corporatePhone || profile.signerPhone);
    const businessName = profile.legalName || 'Cliqbux';
    const firstName = control?.firstName || profile.firstName || '';
    const appStatus = String(profile.applicationStatus || '');
    const atSigning = appStatus !== 'Submitted'
      && ['signing', 'pending_signature'].includes(String(profile.portalLockStatus || '').toLowerCase());

    // Prefer Verify & Sign when we have a control person with verify path; else resume token
    let link = '';
    let intent: 'sign' | 'resume' = 'resume';

    if (control?.id && (atSigning || control.verifyToken || control.identityStatus)) {
      const token = control.verifyToken || generateToken();
      link = `${getPortalBaseUrl()}/verify?token=${encodeURIComponent(token)}&intent=sign`;
      intent = 'sign';
      if (!control.verifyToken) {
        await base44.asServiceRole.entities.MerchantSigners.update(control.id, {
          verifyToken: token,
          verifyTokenSentAt: new Date().toISOString(),
        });
      }
    } else {
      if (!email) return Response.json({ error: 'No signer email on file to nudge' }, { status: 422 });
      const token = generateToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      try {
        const existing = await base44.asServiceRole.entities.MerchantAccessTokens.filter({ corporateId, used: false });
        for (const t of (existing || [])) {
          await base44.asServiceRole.entities.MerchantAccessTokens.update(t.id, { used: true });
        }
      } catch { /* non-fatal */ }
      await base44.asServiceRole.entities.MerchantAccessTokens.create({
        token, corporateId, email, expiresAt, used: false, createdAt: now.toISOString(),
      });
      link = `${getPortalBaseUrl()}?token=${token}`;
      intent = 'resume';
    }

    const results: { email?: string; sms?: string; errors: string[] } = { errors: [] };
    const wantEmail = channels === 'email' || channels === 'both';
    const wantSms = channels === 'sms' || channels === 'both';

    if (wantEmail) {
      if (!email) {
        results.errors.push('No email on file');
      } else {
        try {
          const subject = intent === 'sign'
            ? `Action Required: Review & Sign — ${businessName}`
            : `Continue your Cliqbux merchant application`;
          await sendViaResend(email, subject, buildNudgeEmail(firstName, link, businessName, intent));
          results.email = 'sent';
        } catch (e: any) {
          results.errors.push(`Email: ${e?.message || e}`);
        }
      }
    }

    if (wantSms) {
      if (!phone) {
        results.errors.push('No phone on file (signer corporatePhone)');
      } else {
        try {
          const smsBody = intent === 'sign'
            ? `Cliqbux: please review & sign your merchant application: ${link}`
            : `Cliqbux: continue your merchant application: ${link}`;
          await sendViaQuo(phone, smsBody);
          results.sms = 'sent';
        } catch (e: any) {
          results.errors.push(`SMS: ${e?.message || e}`);
        }
      }
    }

    // Best-effort activity log on auto-track
    try {
      const stages = await base44.asServiceRole.entities.StagedApplication.filter({
        corporateId,
        label: '__auto_track__',
      });
      const track = stages?.[0];
      if (track?.id) {
        const prev = (track.prefilledData && typeof track.prefilledData === 'object') ? track.prefilledData : {};
        const activity = (prev.activity && typeof prev.activity === 'object') ? { ...prev.activity } : {};
        const recent = Array.isArray(activity.recent) ? [...activity.recent] : [];
        recent.unshift({
          type: 'nudge_sent',
          actor: 'agent',
          at: new Date().toISOString(),
          detail: channels,
          email: email || undefined,
        });
        activity.recent = recent.slice(0, 40);
        activity.nudgesSent = (Number(activity.nudgesSent) || 0) + 1;
        await base44.asServiceRole.entities.StagedApplication.update(track.id, {
          prefilledData: { ...prev, activity },
        });
      }
    } catch (e: any) {
      console.warn('[nudgeMerchant] activity log failed:', e?.message);
    }

    const anyOk = results.email === 'sent' || results.sms === 'sent';
    if (!anyOk) {
      return Response.json({
        error: results.errors.join(' · ') || 'Nudge failed',
        results,
      }, { status: 422 });
    }

    return Response.json({
      success: true,
      channels,
      intent,
      link,
      to: { email: email || null, phone: phone || null },
      results,
      warnings: results.errors.length ? results.errors : undefined,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
