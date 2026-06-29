import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const TOKEN_TTL_DAYS = 7;

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

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Cliqbux Onboarding <onboarding@cliqbux.com>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

function buildResumeEmail(firstName: string, resumeUrl: string, businessName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#111827;padding:28px 40px;text-align:center;">
            <span style="color:#F59E0B;font-size:22px;font-weight:800;letter-spacing:-0.5px;">⬡ cliqbux</span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Resume Your Application</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">Your application link is ready</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Hi ${firstName || 'there'},<br><br>
              Click below to pick up where you left off on your <strong>${businessName || 'Cliqbux'}</strong> merchant application. Your progress is saved — just click and continue.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 28px;">
                  <a href="${resumeUrl}" target="_blank" style="display:inline-block;background:#111827;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                    Continue My Application →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#6B7280;line-height:1.6;">
              This link is unique to you — please do not share it. It expires in ${TOKEN_TTL_DAYS} days.
            </p>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              Having trouble? Copy and paste this link into your browser:<br>
              <span style="color:#3B82F6;word-break:break-all;">${resumeUrl}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:20px 40px;text-align:center;border-top:1px solid #E5E7EB;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              © ${new Date().getFullYear()} Cliqbux · You're receiving this because you requested access to your merchant application.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const email = (body.email || '').trim().toLowerCase();

    if (!email) {
      return Response.json({ error: 'email is required' }, { status: 400 });
    }

    const [profiles, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ signerEmail: email }),
      base44.asServiceRole.entities.MerchantSigners.filter({ signerEmail: email }),
    ]);

    const profile = profiles?.[0];
    const signerRecord = signers?.[0];
    const corporateId = profile?.corporateId || signerRecord?.corporateId;

    if (!corporateId) {
      console.log(`[sendResumeLink] No merchant found for email: ${email}`);
      return Response.json({ success: true, message: 'If an application exists for that email, a link has been sent.' });
    }

    const resolvedProfile = profile || (signerRecord?.corporateId
      ? (await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: signerRecord.corporateId }))?.[0]
      : null);

    const firstName = resolvedProfile?.firstName || '';
    const businessName = resolvedProfile?.legalName || '';

    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    try {
      const existing = await base44.asServiceRole.entities.MerchantAccessTokens.filter({ corporateId, used: false });
      for (const t of (existing || [])) {
        await base44.asServiceRole.entities.MerchantAccessTokens.update(t.id, { used: true });
      }
    } catch {
      // Non-fatal
    }

    await base44.asServiceRole.entities.MerchantAccessTokens.create({
      token, corporateId, email, expiresAt, used: false, createdAt: now.toISOString(),
    });

    const resumeUrl = `${getPortalBaseUrl()}?token=${token}`;
    await sendViaResend(email, `Resume your Cliqbux merchant application`, buildResumeEmail(firstName, resumeUrl, businessName));

    console.log(`[sendResumeLink] Sent resume link to ${email} for corporateId=${corporateId}`);

    return Response.json({ success: true, message: 'If an application exists for that email, a link has been sent.' });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});