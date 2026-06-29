import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getVerifyBaseUrl() {
  // Prefer the explicitly configured PUBLIC_APP_URL; fall back to the Base44 staging domain
  const configured = Deno.env.get('PUBLIC_APP_URL');
  const appId = Deno.env.get('BASE44_APP_ID');
  console.log('DEBUG: PUBLIC_APP_URL=' + (configured || 'NOT_SET') + ' | BASE44_APP_ID=' + (appId || 'NOT_SET'));
  if (configured && configured.startsWith('http')) return configured.replace(/\/$/, '');
  if (appId) return `https://${appId}.base44.app`;
  return 'https://onboarding.cliqbux.com';
}

function buildInviteEmail(firstName, verifyUrl, businessName) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#111827;padding:28px 40px;text-align:center;">
            <span style="color:#F59E0B;font-size:22px;font-weight:800;letter-spacing:-0.5px;">⬡ cliqbux</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Action Required</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">Complete Your Identity Verification</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Hi ${firstName},<br><br>
              You've been added as a <strong>beneficial owner</strong> on the <strong>${businessName || 'Cliqbux'}</strong> merchant application. To comply with financial regulations, we need to verify your identity before the application can be submitted.
            </p>
            <!-- CTA Button -->
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
        <!-- Footer -->
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
    console.log('ENV_CHECK PUBLIC_APP_URL=' + (Deno.env.get('PUBLIC_APP_URL') || 'NOT_SET'));
    console.log('ENV_CHECK BASE44_APP_ID=' + (Deno.env.get('BASE44_APP_ID') || 'NOT_SET'));
    const body = await req.json();
    const { action, corporateId, signerId, signerData, sendInvite } = body;

    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });

    // --- CREATE ---
    if (action === 'create') {
      const token = generateToken();

      // Step 1: persist the signer record
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

      // Step 2: send invite email (non-fatal — signer is already saved)
      let emailError: string | null = null;
      if (sendInvite) {
        try {
          const verifyUrl = `${getVerifyBaseUrl()}/verify?token=${token}`;
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: signerData.signerEmail,
            subject: `Action Required: Verify Your Identity — ${signerData.legalName || 'Cliqbux'} Merchant Application`,
            body: buildInviteEmail(signerData.firstName, verifyUrl, signerData.legalName)
          });
          await base44.asServiceRole.entities.MerchantSigners.update(record.id, { identityStatus: 'Sent' });
          record.identityStatus = 'Sent';
        } catch (emailErr: any) {
          console.error('[manageSigner] email send failed:', emailErr.message);
          emailError = emailErr.message;
          // Keep identityStatus as 'Pending Invitation' — admin can resend later
        }
      }

      return Response.json({ success: true, signer: record, ...(emailError ? { emailError } : {}) });
    }

    // --- UPDATE ---
    if (action === 'update') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const ALLOWED = ['firstName','lastName','signerEmail','ownershipPercentage','isPrimarySigner',
        'identityStatus','dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone','idDocumentUrl'];
      const update = {};
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
      const signer = signers.find(s => s.id === signerId);
      if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });

      const token = signer.verifyToken || generateToken();
      const verifyUrl = `${getVerifyBaseUrl()}/verify?token=${token}`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: signer.signerEmail,
        subject: `Action Required: Verify Your Identity — Cliqbux Merchant Application`,
        body: buildInviteEmail(signer.firstName, verifyUrl, null)
      });

      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, {
        identityStatus: 'Sent',
        verifyToken: token
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
      let signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      // A 'Verified' primary signer from a prior incomplete session would trigger
      // envelope generation on mount, locking the name fields and auto-loading
      // the agreement. Demote such stale self-serve records back to pending so the
      // merchant starts fresh on each Step 3 visit and must re-verify to unblock signing.
      signers = signers.map(s =>
        s.isPrimarySigner && s.identityStatus === 'Verified'
          ? { ...s, identityStatus: 'Pending Invitation' }
          : s
      );
      return Response.json({ success: true, signers });
    }

    // --- INLINE VERIFY (primary owner verifies directly on the portal, no email) ---
    if (action === 'inlineVerify') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const ALLOWED = ['dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone','idDocumentUrl'];
      const update = { identityStatus: 'Verified' };
      for (const key of ALLOWED) {
        if (signerData && signerData[key] !== undefined) update[key] = signerData[key];
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, update);
      return Response.json({ success: true, signer: updated });
    }

    // --- LOOKUP BY EMAIL (check if signer has a prior verified record on another application) ---
    if (action === 'lookupByEmail') {
      const { signerEmail } = body;
      if (!signerEmail) return Response.json({ found: false });
      // Find all verified signers with this email across all corporate IDs except the current one
      const allMatches = await base44.asServiceRole.entities.MerchantSigners.filter({ signerEmail });
      const prior = allMatches.find(s =>
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

    // --- UPDATE (also allow idDocumentUrl) ---

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});