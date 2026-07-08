import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getVerifyBaseUrl() {
  const configured = Deno.env.get('PUBLIC_APP_URL');
  const appId = Deno.env.get('BASE44_APP_ID');
  if (configured && configured.startsWith('http')) return configured.replace(/\/$/, '');
  if (appId) return `https://${appId}.base44.app`;
  return 'https://onboarding.cliqbux.com';
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Cliqbux Onboarding <onboarding@onboarding.cliqbuxpos.com>',
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

function buildInviteEmail(firstName: string, verifyUrl: string, businessName: string | null): string {
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
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Action Required</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">Complete Your Identity Verification</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Hi ${firstName},<br><br>
              You've been added as a <strong>beneficial owner</strong> on the <strong>${businessName || 'Cliqbux'}</strong> merchant application. To comply with financial regulations, we need to verify your identity before the application can be submitted.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 28px;">
                  <a href="${verifyUrl}" target="_blank" style="display:inline-block;background:#111827;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                    Verify My Identity →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#6B7280;line-height:1.6;">
              This link is unique to you — please do not share it. It expires after 7 days.
            </p>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">
              Having trouble? Copy and paste this link into your browser:<br>
              <span style="color:#3B82F6;word-break:break-all;">${verifyUrl}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9CA3AF;">© ${new Date().getFullYear()} Cliqbux · onboarding.cliqbux.com</p>
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
    const body = await req.json();
    const { action, corporateId, signerId, signerData, sendInvite } = body;

    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });

    // --- CREATE ---
    if (action === 'create') {
      const token = generateToken();
      let record;
      try {
        record = await base44.asServiceRole.entities.MerchantSigners.create({
          corporateId,
          firstName: signerData.firstName,
          lastName: signerData.lastName,
          signerEmail: signerData.signerEmail,
          ownershipPercentage: Number(signerData.ownershipPercentage) || 0,
          isPrimarySigner: signerData.isPrimarySigner || false,
          identityStatus: 'Pending Invitation',
          verifyToken: token,
          dobYear: signerData.dobYear || '',
          dobMonth: signerData.dobMonth || '',
          dobDay: signerData.dobDay || '',
          ssn: signerData.ssn || '',
          homeStreet: signerData.homeStreet || '',
          homeCity: signerData.homeCity || '',
          homeState: signerData.homeState || '',
          homeZip: signerData.homeZip || '',
          corporatePhone: signerData.corporatePhone || '',
        });
      } catch (createErr: any) {
        console.error('[manageSigner] create failed:', createErr.message);
        return Response.json({ error: `Failed to create signer record: ${createErr.message}` }, { status: 500 });
      }

      let emailError: string | null = null;
      if (sendInvite) {
        try {
          const verifyUrl = `${getVerifyBaseUrl()}/verify?token=${token}`;
          await sendViaResend(
            signerData.signerEmail,
            `Action Required: Verify Your Identity — ${signerData.legalName || 'Cliqbux'} Merchant Application`,
            buildInviteEmail(signerData.firstName, verifyUrl, signerData.legalName)
          );
          await base44.asServiceRole.entities.MerchantSigners.update(record.id, { identityStatus: 'Sent', verifyTokenSentAt: new Date().toISOString() });
          record.identityStatus = 'Sent';
        } catch (emailErr: any) {
          console.error('[manageSigner] email send failed:', emailErr.message);
          emailError = emailErr.message;
        }
      }

      return Response.json({ success: true, signer: record, ...(emailError ? { emailError } : {}) });
    }

    // --- UPDATE ---
    if (action === 'update') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const ALLOWED = ['firstName','lastName','signerEmail','ownershipPercentage','isPrimarySigner',
        'identityStatus','dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone','idDocumentUrl','titleType'];
      const update: Record<string, any> = {};
      for (const key of ALLOWED) {
        if (signerData[key] !== undefined) update[key] = signerData[key];
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, update);
      return Response.json({ success: true, signer: updated });
    }

    // --- SEND INVITE ---
    if (action === 'sendInvite') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      const signer = signers.find((s: any) => s.id === signerId);
      if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });

      const token = signer.verifyToken || generateToken();
      const verifyUrl = `${getVerifyBaseUrl()}/verify?token=${token}`;

      await sendViaResend(
        signer.signerEmail,
        `Action Required: Verify Your Identity — Cliqbux Merchant Application`,
        buildInviteEmail(signer.firstName, verifyUrl, null)
      );

      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, {
        identityStatus: 'Sent',
        verifyToken: token,
        verifyTokenSentAt: new Date().toISOString()
      });
      return Response.json({ success: true, signer: updated });
    }

    // --- DELETE ---
    if (action === 'delete') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      await base44.asServiceRole.entities.MerchantSigners.delete(signerId);
      return Response.json({ success: true });
    }

    // --- LIST ---
    if (action === 'list') {
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      return Response.json({ success: true, signers });
    }

    // --- INLINE VERIFY ---
    if (action === 'inlineVerify') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const ALLOWED = ['dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone','idDocumentUrl','titleType'];
      const update: Record<string, any> = { identityStatus: 'Verified' };
      for (const key of ALLOWED) {
        if (signerData && signerData[key] !== undefined) update[key] = signerData[key];
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, update);
      return Response.json({ success: true, signer: updated });
    }

    // --- LOOKUP BY EMAIL ---
    if (action === 'lookupByEmail') {
      const { signerEmail } = body;
      if (!signerEmail) return Response.json({ found: false });
      const allMatches = await base44.asServiceRole.entities.MerchantSigners.filter({ signerEmail });
      const prior = allMatches.find((s: any) =>
        s.corporateId !== corporateId &&
        s.identityStatus === 'Verified' &&
        s.dobYear && s.ssn
      );
      if (!prior) return Response.json({ found: false });
      return Response.json({
        found: true,
        signerData: {
          dobMonth: prior.dobMonth || '',
          dobDay: prior.dobDay || '',
          dobYear: prior.dobYear || '',
          ssn: prior.ssn || '',
          homeStreet: prior.homeStreet || '',
          homeCity: prior.homeCity || '',
          homeState: prior.homeState || '',
          homeZip: prior.homeZip || '',
          corporatePhone: prior.corporatePhone || '',
          idDocumentUrl: prior.idDocumentUrl || '',
        }
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});