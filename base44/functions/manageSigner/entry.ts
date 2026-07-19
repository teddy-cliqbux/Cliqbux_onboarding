import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Portal auth (inlined) ─────────────────────────────────────────────────────────────────────
// Base44 bundles each function in isolation, so this is duplicated from
// base44/functions/helpers/auth.ts — keep both copies in sync.
// getPortalActor returns { actor: 'merchant', corporateId } when the request
// carries a valid merchant JWT (issued by validateResumeToken, createHubspotDeal,
// or manageStagedApplication 'validate'), { actor: 'admin' } when it carries a
// Base44 workspace session, or null when neither. Callers must 401 on null and
// enforce corporateId match for merchant actors.
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
  } catch { /* invalid merchant token — fall through to workspace check */ }
  try {
    const user = await base44.auth.me();
    if (user) return { actor: 'admin' };
  } catch { /* no workspace session */ }
  return null;
}

// --- BEGIN signerRoles (sync with helpers/signerRoles.ts + src/lib/signerRules.js) ---
function ownershipPct(s: any): number {
  const n = Number(s?.ownershipPercentage);
  return Number.isFinite(n) ? n : 0;
}
function isPortalAdminRole(s: any): boolean {
  return s?.isPortalAdmin === true;
}
function isControlPerson(s: any): boolean {
  if (!s || isPortalAdminRole(s)) return false;
  if (s.isAuthorizedSigner === true) return true;
  if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
  return false;
}
function normalizePersonRoleFlags(input: Record<string, any> = {}) {
  const pct = ownershipPct(input);
  let isPortalAdminFlag = input.isPortalAdmin === true;
  let isAuthorizedSigner = input.isAuthorizedSigner === true
    || (input.isAuthorizedSigner == null && input.isPrimarySigner === true);
  let isPrimarySigner = input.isPrimarySigner === true || isAuthorizedSigner;
  if (isPortalAdminFlag) {
    isAuthorizedSigner = false;
    isPrimarySigner = false;
  }
  const ownershipPercentage = isPortalAdminFlag ? 0 : pct;
  let isBeneficialOwnerFlag = !isPortalAdminFlag && (input.isBeneficialOwner === true || ownershipPercentage >= 25);
  if (isPortalAdminFlag) isBeneficialOwnerFlag = false;
  if (!isPortalAdminFlag && ownershipPercentage >= 25) isBeneficialOwnerFlag = true;
  if (!isPortalAdminFlag && ownershipPercentage < 25 && input.isBeneficialOwner !== true) {
    isBeneficialOwnerFlag = false;
  }
  if (isAuthorizedSigner) isPortalAdminFlag = false;
  return {
    ownershipPercentage,
    isPortalAdmin: isPortalAdminFlag,
    isAuthorizedSigner,
    isPrimarySigner,
    isBeneficialOwner: isBeneficialOwnerFlag,
    needsGatewayUserProvisioning: isPortalAdminFlag === true,
  };
}
async function ensureUniqueControlPerson(base44: any, corporateId: string, keepSignerId: string) {
  const all = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId: String(corporateId) });
  for (const s of all || []) {
    if (String(s.id) === String(keepSignerId)) continue;
    if (!isControlPerson(s)) continue;
    await base44.asServiceRole.entities.MerchantSigners.update(s.id, {
      isAuthorizedSigner: false,
      isPrimarySigner: false,
    });
  }
}
// --- END signerRoles ---

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
      attachments: [resendInlineLogoAttachment()],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

// Remote invites:
// - Beneficial Owners (KYC-only): intent=kyc — confirm identity, no BoldSign
// - Control Person: intent=sign — KYC (if needed) then Merchant Processing Agreement
function buildKycInviteEmail(firstName: string, verifyUrl: string, businessName: string | null): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#111827;padding:28px 40px;text-align:center;">
            ${emailLogoHeaderHtml()}
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Action Required</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">Confirm Your Identity</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Hi ${firstName},<br><br>
              You've been listed as a <strong>beneficial owner</strong> on the <strong>${businessName || 'Cliqbux'}</strong> merchant application. We need a few identity details for compliance — you do <strong>not</strong> need to sign the processing agreement (the Control Person handles that).
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 28px;">
                  <a href="${verifyUrl}" target="_blank" style="display:inline-block;background:#FEAC27;color:#111827;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                    Verify My Identity
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

function buildSignInviteEmail(firstName: string, verifyUrl: string, businessName: string | null): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#111827;padding:28px 40px;text-align:center;">
            ${emailLogoHeaderHtml()}
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.06em;">Action Required</p>
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;line-height:1.3;">Verify &amp; Sign Merchant Agreement</h1>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Hi ${firstName},<br><br>
              You're the <strong>Control Person</strong> (authorized signer) for the <strong>${businessName || 'Cliqbux'}</strong> merchant application. One secure link covers identity confirmation (if needed) and signing the Merchant Processing Agreement.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 28px;">
                  <a href="${verifyUrl}" target="_blank" style="display:inline-block;background:#FEAC27;color:#111827;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.01em;">
                    Verify &amp; Sign Documents
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

function buildInviteUrl(token: string, intent: 'kyc' | 'sign'): string {
  return `${getVerifyBaseUrl()}/verify?token=${encodeURIComponent(token)}&intent=${intent}`;
}

function buildSigningInviteUrl(token: string): string {
  return buildInviteUrl(token, 'sign');
}

/** Log signer invite/open onto __auto_track__.prefilledData.activity (Applications panel). */
async function logSignerActivity(base44: any, corporateId: string, event: any) {
  try {
    const cid = String(corporateId ?? '').trim();
    const tryFilter = async (corp: string | number) => {
      const rows = await base44.asServiceRole.entities.StagedApplication.filter(
        { corporateId: corp, label: '__auto_track__' }, '-created_date', 5
      );
      return Array.isArray(rows) ? rows : [];
    };
    let rows = await tryFilter(cid);
    if (rows.length === 0 && /^\d+$/.test(cid)) rows = await tryFilter(Number(cid));
    let existing = rows[0] || null;
    if (!existing) {
      try {
        const scan = await base44.asServiceRole.entities.StagedApplication.filter(
          { label: '__auto_track__' }, '-created_date', 100
        );
        existing = (scan || []).find((s: any) => String(s.corporateId) === cid) || null;
      } catch { /* non-fatal */ }
    }

    let prev: Record<string, any> = {};
    const raw = existing?.prefilledData;
    if (typeof raw === 'string') {
      try { prev = JSON.parse(raw) || {}; } catch { prev = {}; }
    } else if (raw && typeof raw === 'object') {
      prev = raw;
    }
    const prevAct = (prev.activity && typeof prev.activity === 'object') ? prev.activity : {};
    const at = new Date().toISOString();
    const type = String(event?.type || '');
    const actor = event?.actor === 'agent' ? 'agent' : event?.actor === 'signer' ? 'signer' : 'merchant';
    const detail = event?.email || event?.detail || undefined;
    const recent = [
      { type, at, actor, detail },
      ...(Array.isArray(prevAct.recent) ? prevAct.recent : []),
    ].slice(0, 25);
    const activity: any = { ...prevAct, recent };
    if (type === 'signer_invite_sent') {
      activity.signerInvitesSent = (prevAct.signerInvitesSent || 0) + 1;
      activity.signerLastInviteAt = at;
    } else if (type === 'signer_link_opened') {
      activity.signerLinkOpens = (prevAct.signerLinkOpens || 0) + 1;
      activity.signerLastOpenAt = at;
    }
    const prefilledData = { ...prev, activity, lastSeenAt: at };
    if (existing?.id) {
      await base44.asServiceRole.entities.StagedApplication.update(existing.id, {
        prefilledData,
        corporateId: cid,
      });
    } else {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const accessToken = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      await base44.asServiceRole.entities.StagedApplication.create({
        corporateId: cid,
        label: '__auto_track__',
        status: 'draft',
        accessToken,
        prefilledData,
      });
    }
  } catch (e: any) {
    console.warn('[manageSigner] logSignerActivity failed:', e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, corporateId, signerId, signerData, sendInvite } = body;

    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Portal form lock — allow list / markSigned / invites / lookup; block data mutations
    const LOCK_SAFE = new Set([
      'list', 'markSigned', 'sendInvite', 'sendSigningInvite', 'getSigningInviteLink',
      'lookupByEmail', 'setLifecycleStatus', 'markSigningFailed', 'healControlPerson',
    ]);
    if (!LOCK_SAFE.has(String(action))) {
      const lockProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const lockProfile = lockProfiles?.[0];
      const lock = String(lockProfile?.portalLockStatus || 'unlocked').toLowerCase();
      const formsLocked = lockProfile?.applicationStatus === 'Submitted'
        || lock === 'signing' || lock === 'pending_signature' || lock === 'all_signed';
      if (formsLocked) {
        return Response.json({
          error: 'Forms are locked while the merchant agreement is in signing. Use Unlock & Modify Details first.',
          code: 'FORMS_LOCKED',
        }, { status: 423 });
      }
    }

    // --- CREATE ---
    if (action === 'create') {
      const token = generateToken();
      const roles = normalizePersonRoleFlags(signerData || {});

      // Continuity: stamp merchantAccountId from profile; prefer KYC from same-account prior signer
      let merchantAccountId = '';
      let kycFromAccount: Record<string, string> = {};
      try {
        const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
        merchantAccountId = profiles?.[0]?.merchantAccountId ? String(profiles[0].merchantAccountId) : '';
        if (merchantAccountId && signerData?.signerEmail) {
          const accountSigners = await base44.asServiceRole.entities.MerchantSigners.filter({
            merchantAccountId,
            signerEmail: String(signerData.signerEmail).toLowerCase(),
          });
          const prior = (accountSigners || []).find((s: any) =>
            s.corporateId !== String(corporateId) &&
            s.dobYear && s.ssn &&
            ['verified', 'Verified', 'application signed', 'Signed'].includes(String(s.identityStatus || ''))
          );
          if (prior) {
            kycFromAccount = {
              dobYear: prior.dobYear || '',
              dobMonth: prior.dobMonth || '',
              dobDay: prior.dobDay || '',
              ssn: prior.ssn || '',
              homeStreet: prior.homeStreet || '',
              homeCity: prior.homeCity || '',
              homeState: prior.homeState || '',
              homeZip: prior.homeZip || '',
              corporatePhone: prior.corporatePhone || '',
              titleType: prior.titleType || '',
            };
          }
        }
      } catch (e: any) {
        console.warn('[manageSigner.create] account KYC lookup failed:', e?.message);
      }

      let record;
      try {
        record = await base44.asServiceRole.entities.MerchantSigners.create({
          corporateId,
          ...(merchantAccountId ? { merchantAccountId } : {}),
          firstName: signerData.firstName,
          lastName: signerData.lastName,
          signerEmail: signerData.signerEmail,
          ownershipPercentage: roles.ownershipPercentage,
          isPrimarySigner: roles.isPrimarySigner,
          isAuthorizedSigner: roles.isAuthorizedSigner,
          isBeneficialOwner: roles.isBeneficialOwner,
          isPortalAdmin: roles.isPortalAdmin,
          needsGatewayUserProvisioning: roles.needsGatewayUserProvisioning,
          identityStatus: roles.isPortalAdmin ? 'verified' : 'Pending Invitation',
          verifyToken: token,
          dobYear: signerData.dobYear || kycFromAccount.dobYear || '',
          dobMonth: signerData.dobMonth || kycFromAccount.dobMonth || '',
          dobDay: signerData.dobDay || kycFromAccount.dobDay || '',
          ssn: signerData.ssn || kycFromAccount.ssn || '',
          homeStreet: signerData.homeStreet || kycFromAccount.homeStreet || '',
          homeCity: signerData.homeCity || kycFromAccount.homeCity || '',
          homeState: signerData.homeState || kycFromAccount.homeState || '',
          homeZip: signerData.homeZip || kycFromAccount.homeZip || '',
          corporatePhone: signerData.corporatePhone || kycFromAccount.corporatePhone || '',
          ...(kycFromAccount.titleType && !signerData.titleType ? { titleType: kycFromAccount.titleType } : {}),
        });
      } catch (createErr: any) {
        console.error('[manageSigner] create failed:', createErr.message);
        return Response.json({ error: `Failed to create signer record: ${createErr.message}` }, { status: 500 });
      }

      if (roles.isAuthorizedSigner && record?.id) {
        try {
          await ensureUniqueControlPerson(base44, String(corporateId), String(record.id));
        } catch (e: any) {
          console.warn('[manageSigner] ensureUniqueControlPerson failed:', e?.message);
        }
      }

      let emailError: string | null = null;
      if (sendInvite && !roles.isPortalAdmin) {
        try {
          const intent: 'kyc' | 'sign' = roles.isAuthorizedSigner ? 'sign' : 'kyc';
          const verifyUrl = buildInviteUrl(token, intent);
          const invitedAt = new Date().toISOString();
          const html = intent === 'sign'
            ? buildSignInviteEmail(signerData.firstName, verifyUrl, signerData.legalName)
            : buildKycInviteEmail(signerData.firstName, verifyUrl, signerData.legalName);
          const subject = intent === 'sign'
            ? `Action Required: Verify & Sign — ${signerData.legalName || 'Cliqbux'} Merchant Application`
            : `Action Required: Confirm Your Identity — ${signerData.legalName || 'Cliqbux'} Merchant Application`;
          await sendViaResend(signerData.signerEmail, subject, html);
          await base44.asServiceRole.entities.MerchantSigners.update(record.id, {
            identityStatus: 'invited',
            verifyTokenSentAt: invitedAt,
            invitedAt,
          });
          record.identityStatus = 'invited';
          record.invitedAt = invitedAt;
          await logSignerActivity(base44, String(corporateId), {
            type: 'signer_invite_sent',
            actor: actor.actor === 'admin' ? 'agent' : 'merchant',
            email: signerData.signerEmail,
          });
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
        'isAuthorizedSigner','isBeneficialOwner','isPortalAdmin','needsGatewayUserProvisioning',
        'identityStatus','dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone','idDocumentUrl','titleType',
        'invitedAt','openedAt','signedAt','verifyToken','verifyTokenSentAt'];
      const update: Record<string, any> = {};
      for (const key of ALLOWED) {
        if (signerData[key] !== undefined) update[key] = signerData[key];
      }
      // Normalize role flags whenever ownership or role fields change
      if (
        update.ownershipPercentage !== undefined
        || update.isPrimarySigner !== undefined
        || update.isAuthorizedSigner !== undefined
        || update.isBeneficialOwner !== undefined
        || update.isPortalAdmin !== undefined
      ) {
        const existing = (await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId: String(corporateId) }))
          .find((s: any) => String(s.id) === String(signerId));
        const merged = { ...(existing || {}), ...update };
        Object.assign(update, normalizePersonRoleFlags(merged));
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, update);
      if (update.isAuthorizedSigner === true) {
        try {
          await ensureUniqueControlPerson(base44, String(corporateId), String(signerId));
        } catch (e: any) {
          console.warn('[manageSigner] ensureUniqueControlPerson failed:', e?.message);
        }
      }
      return Response.json({ success: true, signer: updated });
    }

    // --- GET SIGNING INVITE LINK (admin only — Copy Direct Link in Applications) ---
    // Aliases avoid a bare "Unknown action" 400 if an older frontend typo reaches a new deploy.
    if (
      action === 'getSigningInviteLink'
      || action === 'copySigningInviteLink'
      || action === 'getSignerInviteLink'
    ) {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Unauthorized — admin session required to copy signer links' }, { status: 401 });
      }
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId: String(corporateId) });
      const signer = signers.find((s: any) => String(s.id) === String(signerId));
      if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });

      let token = String(signer.verifyToken || '').trim();
      if (!token) {
        token = generateToken();
        try {
          await base44.asServiceRole.entities.MerchantSigners.update(signer.id, {
            verifyToken: token,
            verifyTokenSentAt: new Date().toISOString(),
          });
        } catch (e: any) {
          console.warn('[manageSigner] getSigningInviteLink persist token failed:', e.message);
        }
      }
      return Response.json({
        success: true,
        link: buildSigningInviteUrl(token),
        signerId: signer.id,
      });
    }

    // --- SEND INVITE ---
    // intent: 'kyc' (Beneficial Owner identity only) | 'sign' (Control Person KYC + BoldSign).
    // Auto: Control Person → sign; everyone else → kyc. Form fillers who are NOT the
    // Control Person use intent=sign when inviting the Control Person remotely.
    if (action === 'sendInvite' || action === 'sendSigningInvite') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      const signer = signers.find((s: any) => s.id === signerId);
      if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });

      let businessName: string | null = null;
      try {
        const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
        businessName = profiles?.[0]?.legalName || null;
      } catch { /* non-fatal */ }

      const requestedIntent = String(body.intent || '').toLowerCase();
      const isControl = isControlPerson(signer);
      const intent: 'kyc' | 'sign' =
        requestedIntent === 'kyc' || requestedIntent === 'sign'
          ? (requestedIntent as 'kyc' | 'sign')
          : (action === 'sendSigningInvite' || isControl ? 'sign' : 'kyc');

      const token = signer.verifyToken || generateToken();
      const verifyUrl = buildInviteUrl(token, intent);
      const sentAt = new Date().toISOString();
      const html = intent === 'sign'
        ? buildSignInviteEmail(signer.firstName, verifyUrl, businessName)
        : buildKycInviteEmail(signer.firstName, verifyUrl, businessName);
      const subject = intent === 'sign'
        ? `Action Required: Verify & Sign — ${businessName || 'Cliqbux'} Merchant Application`
        : `Action Required: Confirm Your Identity — ${businessName || 'Cliqbux'} Merchant Application`;

      await sendViaResend(signer.signerEmail, subject, html);

      const st = String(signer.identityStatus || '').trim();
      const preserveStatus =
        st === 'verified' || st === 'Verified'
        || st === 'opened'
        || st === 'application signed' || st === 'Signed';

      const patch: Record<string, any> = {
        verifyToken: token,
        verifyTokenSentAt: sentAt,
      };
      if (!preserveStatus) {
        patch.identityStatus = 'invited';
        patch.invitedAt = sentAt;
      } else if (!signer.invitedAt) {
        patch.invitedAt = sentAt;
      }

      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, patch);
      await logSignerActivity(base44, String(corporateId), {
        type: 'signer_invite_sent',
        actor: actor.actor === 'admin' ? 'agent' : 'merchant',
        email: signer.signerEmail,
      });
      return Response.json({ success: true, signer: updated, link: verifyUrl, intent });
    }

    // --- MARK SIGNED (local persistence — never poll MSPWare from admin list UIs) ---
    // Only Verified → application signed. Callers must confirm BoldSign completed.
    if (action === 'markSigned') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      const signer = signers.find((s: any) => s.id === signerId);
      if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });
      if (signer.identityStatus === 'Signed' || signer.identityStatus === 'application signed') {
        return Response.json({ success: true, signer });
      }
      const st = String(signer.identityStatus || '');
      if (st !== 'Verified' && st !== 'verified') {
        return Response.json({
          error: 'Identity must be verified before marking application signed.',
          identityStatus: signer.identityStatus,
        }, { status: 409 });
      }
      const signedAt = new Date().toISOString();
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, {
        identityStatus: 'application signed',
        signedAt,
      });

      // Promote portal lock to all_signed when every required owner has signed
      try {
        const allSigners = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
        const required = (allSigners || []).filter((s: any) => isControlPerson(s));
        const allDone = required.length > 0 && required.every((s: any) => {
          const st = String(s.id === signerId ? 'application signed' : (s.identityStatus || ''));
          return st === 'application signed' || st === 'Signed';
        });
        if (allDone) {
          const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
          if (profiles?.[0]?.id) {
            await base44.asServiceRole.entities.MerchantCorporateProfile.update(profiles[0].id, {
              portalLockStatus: 'all_signed',
            });
          }
        }
      } catch (e: any) {
        console.warn('[manageSigner.markSigned] portalLockStatus all_signed update failed:', e?.message);
      }

      return Response.json({ success: true, signer: updated });
    }

    // --- SET LIFECYCLE (admin only — correct false promotions / manual ops) ---
    if (action === 'setLifecycleStatus') {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const next = String(body.status || body.identityStatus || '').trim();
      const allowed = new Set([
        'Pending Invitation', 'invited', 'opened', 'verified', 'application signed', 'signing failed',
        // legacy accepted for repair
        'Sent', 'Verified', 'Signed', 'Action Required',
      ]);
      if (!allowed.has(next)) {
        return Response.json({ error: `Invalid status: ${next}` }, { status: 400 });
      }
      const patch: Record<string, any> = { identityStatus: next };
      if (next === 'verified' || next === 'Verified') {
        patch.signedAt = null;
      }
      if (next === 'application signed' || next === 'Signed') {
        patch.signedAt = new Date().toISOString();
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, patch);
      return Response.json({ success: true, signer: updated });
    }

    // --- MARK SIGNING FAILED (admin / system) ---
    if (action === 'markSigningFailed') {
      if (actor.actor !== 'admin') {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signerId, {
        identityStatus: 'signing failed',
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
      let signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }) || [];
      // Heal sole non-admin owner missing Control Person flags (list is lock-safe).
      // Without this, verified BOs show "Signing Locked" and get no BoldSign package.
      let healedControlPersonId: string | null = null;
      const controls = signers.filter((s: any) => isControlPerson(s));
      if (controls.length === 0) {
        const nonAdmin = signers.filter((s: any) => s && !isPortalAdminRole(s));
        if (nonAdmin.length === 1 && nonAdmin[0]?.id) {
          const sole = nonAdmin[0];
          const pct = ownershipPct(sole);
          try {
            const updated = await base44.asServiceRole.entities.MerchantSigners.update(String(sole.id), {
              isAuthorizedSigner: true,
              isPrimarySigner: true,
              isBeneficialOwner: sole.isBeneficialOwner === true || pct >= 25,
              isPortalAdmin: false,
            });
            healedControlPersonId = String(sole.id);
            signers = signers.map((s: any) => (String(s.id) === String(sole.id) ? { ...s, ...updated } : s));
            console.log(`[manageSigner.list] Healed sole Control Person ${sole.id} for corporateId=${corporateId}`);
          } catch (healErr: any) {
            console.warn('[manageSigner.list] Control Person heal failed:', healErr?.message);
          }
        }
      }
      return Response.json({ success: true, signers, healedControlPersonId });
    }

    // Explicit heal (also lock-safe) — used by portal roster after list
    if (action === 'healControlPerson') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const all = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }) || [];
      const controls = all.filter((s: any) => isControlPerson(s));
      if (controls.length > 1) {
        return Response.json({ error: 'Multiple Control Persons already exist', code: 'MULTI_CONTROL' }, { status: 409 });
      }
      if (controls.length === 1 && String(controls[0].id) !== String(signerId)) {
        return Response.json({ error: 'Another Control Person is already designated', code: 'CONTROL_EXISTS' }, { status: 409 });
      }
      const target = all.find((s: any) => String(s.id) === String(signerId));
      if (!target) return Response.json({ error: 'Signer not found' }, { status: 404 });
      if (isPortalAdminRole(target)) {
        return Response.json({ error: 'Portal Admin cannot be Control Person' }, { status: 400 });
      }
      const pct = ownershipPct(target);
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(String(signerId), {
        isAuthorizedSigner: true,
        isPrimarySigner: true,
        isBeneficialOwner: target.isBeneficialOwner === true || pct >= 25,
        isPortalAdmin: false,
      });
      try {
        await ensureUniqueControlPerson(base44, String(corporateId), String(signerId));
      } catch (e: any) {
        console.warn('[manageSigner.healControlPerson] ensureUnique failed:', e?.message);
      }
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }) || [];
      return Response.json({ success: true, signer: updated, signers, healedControlPersonId: String(signerId) });
    }

    // --- INLINE VERIFY ---
    if (action === 'inlineVerify') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const ALLOWED = ['dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone','idDocumentUrl','titleType'];
      const update: Record<string, any> = { identityStatus: 'verified' };
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
      let accountId = '';
      try {
        const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
        accountId = profiles?.[0]?.merchantAccountId ? String(profiles[0].merchantAccountId) : '';
      } catch { /* ignore */ }
      const scored = (allMatches || [])
        .filter((s: any) =>
          s.corporateId !== corporateId &&
          (s.identityStatus === 'Verified' || s.identityStatus === 'verified' || s.identityStatus === 'Signed' || s.identityStatus === 'application signed') &&
          s.dobYear && s.ssn
        )
        .sort((a: any, b: any) => {
          const aSame = accountId && a.merchantAccountId === accountId ? 0 : 1;
          const bSame = accountId && b.merchantAccountId === accountId ? 0 : 1;
          return aSame - bSame;
        });
      const prior = scored[0];
      if (!prior) return Response.json({ found: false });
      return Response.json({
        found: true,
        fromSameAccount: !!(accountId && prior.merchantAccountId === accountId),
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

    return Response.json({
      error: 'Unknown action',
      action: action ?? null,
      hint: 'Expected one of: create, update, getSigningInviteLink, sendInvite, sendSigningInvite, markSigned, setLifecycleStatus, markSigningFailed, delete, list, inlineVerify, lookupByEmail',
    }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});