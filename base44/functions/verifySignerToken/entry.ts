import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// verifySignerToken — powers the public /verify page (src/pages/VerifyIdentity.jsx)
// for INVITED (non-primary) signers completing identity verification AND signing
// remotely, with no Base44 session and no corporateId — only the token from
// their email link.
//
// Unified remote loop (2026-07-13): invite links use ?intent=sign. After KYC
// (or when already Verified), getSigningSession returns ONLY this signer's
// BoldSign iframe URLs — never other owners' links, never a merchant JWT.
//
// Actions:
//   get              — { token } -> { signer, legalName }
//   save             — { token, signerData } -> { signer }  (marks Verified)
//   getSigningSession — { token } -> { applications: [{ mspApplicationNo, merchantName, signingUrl, signed }] }
//   markSigned       — { token } -> { signer }  (identityStatus: Signed — local persistence)
//
// POST /functions/verifySignerToken

const TOKEN_TTL_DAYS = 7;
const DONE_MID_STATUSES = ['Active', 'Active (Existing)', 'Pending MID'];

function isExpired(sentAt: string | undefined): boolean {
  if (!sentAt) return false; // no timestamp on record (e.g. legacy/manually-created) — don't lock people out
  const sentMs = new Date(sentAt).getTime();
  if (Number.isNaN(sentMs)) return false;
  return Date.now() - sentMs > TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function normalizeLifecycle(status: string | undefined): string {
  const s = String(status || '').trim();
  if (!s || s === 'Pending Invitation') return 'pending';
  if (s === 'Sent' || s === 'invited') return 'invited';
  if (s === 'opened') return 'opened';
  if (s === 'Verified' || s === 'verified') return 'verified';
  if (s === 'Signed' || s === 'application signed') return 'application signed';
  if (s === 'Action Required' || s === 'signing failed') return 'signing failed';
  return s.toLowerCase();
}

function isVerifiedOrHigher(status: string | undefined): boolean {
  const n = normalizeLifecycle(status);
  return n === 'verified' || n === 'application signed';
}

function isApplicationSigned(status: string | undefined): boolean {
  return normalizeLifecycle(status) === 'application signed';
}

function canMarkOpened(status: string | undefined): boolean {
  const n = normalizeLifecycle(status);
  return n === 'pending' || n === 'invited';
}

// Only the fields VerifyIdentity.jsx actually needs to render — never return
// the full record's internal bookkeeping (verifyToken itself, etc.) to the client.
function toSafeSigner(s: any) {
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    signerEmail: s.signerEmail || '',
    identityStatus: s.identityStatus,
    invitedAt: s.invitedAt || null,
    openedAt: s.openedAt || null,
    signedAt: s.signedAt || null,
    dobYear: s.dobYear || '',
    dobMonth: s.dobMonth || '',
    dobDay: s.dobDay || '',
    ssn: s.ssn || '',
    homeStreet: s.homeStreet || '',
    homeCity: s.homeCity || '',
    homeState: s.homeState || '',
    homeZip: s.homeZip || '',
    corporatePhone: s.corporatePhone || '',
  };
}

function isPackageSignedStatus(status: string): boolean {
  return ['signed', 'complete', 'completed'].includes((status || '').toLowerCase());
}

/** Log signer link opens onto Applications portal activity (__auto_track__). */
async function logSignerActivity(base44: any, corporateId: string, event: any) {
  try {
    const existing = await base44.asServiceRole.entities.StagedApplication.filter(
      { corporateId, label: '__auto_track__' }, '-created_date', 1
    );
    const prev = (existing[0]?.prefilledData && typeof existing[0].prefilledData === 'object')
      ? existing[0].prefilledData
      : {};
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
    if (existing.length > 0) {
      await base44.asServiceRole.entities.StagedApplication.update(existing[0].id, { prefilledData });
    } else {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const accessToken = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      await base44.asServiceRole.entities.StagedApplication.create({
        corporateId,
        label: '__auto_track__',
        status: 'draft',
        accessToken,
        prefilledData,
      });
    }
  } catch (e: any) {
    console.warn('[verifySignerToken] logSignerActivity failed:', e.message);
  }
}

async function fetchSignerLink(
  mspBase: string,
  mspHeaders: Record<string, string>,
  appNo: string,
  email: string,
): Promise<{ link: string | null; signed: boolean; status: string }> {
  // Package status first (no link needed if already signed)
  let signed = false;
  let status = 'unknown';
  try {
    const statusRes = await fetch(`${mspBase}/applications/${appNo}/signatures`, { headers: mspHeaders });
    const statusData = await statusRes.json();
    const match = (statusData?.signers || []).find((s: any) =>
      (s.emailAddress || s.email || '').toLowerCase() === email.toLowerCase()
    );
    if (match) {
      status = match.localstatus || match.status || 'unknown';
      signed = isPackageSignedStatus(status);
    }
    if (statusData?.signed === true || statusData?.status === 'complete') {
      // Package complete — this signer is done even if their row is missing
      if (!match) signed = true;
    }
  } catch { /* fall through to link fetch */ }

  if (signed) return { link: null, signed: true, status };

  // Link fetch with mandatory 1s retry (same rule as signApplication)
  let link: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
    try {
      const linkRes = await fetch(
        `${mspBase}/applications/${appNo}/signatures/link?emailAddress=${encodeURIComponent(email)}`,
        { headers: mspHeaders },
      );
      const linkData = await linkRes.json();
      link = linkData?.link || null;
      if (link) break;
    } catch { /* retry once */ }
  }
  return { link, signed: false, status };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, token, signerData } = body;

    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    // Look up by token across ALL signers — this is intentionally not scoped to a
    // corporateId, since the whole point of the token is that the invited signer
    // has no session and no corporateId of their own.
    const matches = await base44.asServiceRole.entities.MerchantSigners.filter({ verifyToken: token });
    const signer = matches?.[0];
    if (!signer) {
      return Response.json({ error: 'This verification link is invalid. Please contact the business that invited you for a new link.' }, { status: 404 });
    }

    if (action === 'get') {
      if (isExpired(signer.verifyTokenSentAt)) {
        return Response.json({ error: 'This verification link has expired. Please ask the business to resend your invite.' }, { status: 410 });
      }
      let legalName = '';
      try {
        const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: signer.corporateId });
        legalName = profiles?.[0]?.legalName || '';
      } catch (_) { /* non-fatal — just skip the business name in the header */ }

      // First open: invited / Sent / Pending Invitation → opened (never regress verified+)
      let current = signer;
      if (canMarkOpened(signer.identityStatus)) {
        const openedAt = new Date().toISOString();
        try {
          current = await base44.asServiceRole.entities.MerchantSigners.update(signer.id, {
            identityStatus: 'opened',
            openedAt,
          });
          const who = [signer.firstName, signer.lastName].filter(Boolean).join(' ') || signer.signerEmail;
          await logSignerActivity(base44, String(signer.corporateId), {
            type: 'signer_link_opened',
            actor: 'signer',
            email: signer.signerEmail,
            detail: who,
          });
        } catch (e: any) {
          console.warn('[verifySignerToken] opened transition failed:', e.message);
        }
      }

      return Response.json({ success: true, signer: toSafeSigner(current), legalName });
    }

    if (action === 'save') {
      if (isExpired(signer.verifyTokenSentAt)) {
        return Response.json({ error: 'This verification link has expired. Please ask the business to resend your invite.' }, { status: 410 });
      }
      if (isVerifiedOrHigher(signer.identityStatus)) {
        // Already verified (e.g. double-submit) — treat as success, don't re-validate/overwrite.
        return Response.json({ success: true, signer: toSafeSigner(signer) });
      }

      const dobYear = signerData?.dobYear || '';
      const dobMonth = signerData?.dobMonth || '';
      const dobDay = signerData?.dobDay || '';
      const ssn = (signerData?.ssn || '').replace(/\D/g, '');
      const homeStreet = signerData?.homeStreet || '';
      const homeCity = signerData?.homeCity || '';
      const homeState = signerData?.homeState || '';
      const homeZip = signerData?.homeZip || '';

      if (!dobYear || !dobMonth || !dobDay) {
        return Response.json({ error: 'Date of birth is required.' }, { status: 400 });
      }
      if (ssn.length !== 9) {
        return Response.json({ error: 'A valid 9-digit SSN is required.' }, { status: 400 });
      }
      if (!homeStreet || !homeCity || !homeState || !homeZip) {
        return Response.json({ error: 'Home address is required.' }, { status: 400 });
      }

      const update: Record<string, any> = {
        dobYear, dobMonth, dobDay, ssn,
        homeStreet, homeCity, homeState, homeZip,
        identityStatus: 'verified',
      };
      if (signerData?.firstName) update.firstName = signerData.firstName;
      if (signerData?.lastName) update.lastName = signerData.lastName;
      if (signerData?.corporatePhone !== undefined) update.corporatePhone = signerData.corporatePhone;

      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signer.id, update);
      return Response.json({ success: true, signer: toSafeSigner(updated) });
    }

    // Token-scoped signing bootstrap for the unified remote loop.
    // Returns ONLY this signer's BoldSign links — packages must already exist
    // (created by the merchant portal's signApplication call before invite send).
    if (action === 'getSigningSession') {
      if (isExpired(signer.verifyTokenSentAt)) {
        return Response.json({ error: 'This verification link has expired. Please ask the business to resend your invite.' }, { status: 410 });
      }
      if (!isVerifiedOrHigher(signer.identityStatus)) {
        return Response.json({
          error: 'Complete identity verification before signing.',
          needsKyc: true,
        }, { status: 409 });
      }

      const email = (signer.signerEmail || '').trim();
      if (!email) {
        return Response.json({ error: 'Signer email is missing on this record.' }, { status: 400 });
      }

      if (isApplicationSigned(signer.identityStatus)) {
        return Response.json({
          success: true,
          applications: [],
          allSigned: true,
          signer: toSafeSigner(signer),
        });
      }

      const mspKey = Deno.env.get('MSP_APP_KEY');
      const mspAppId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
      const mspBase = Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2';
      if (!mspKey) {
        return Response.json({ error: 'Signing service is temporarily unavailable. Please try again shortly.' }, { status: 503 });
      }
      const mspHeaders = {
        'Content-Type': 'application/json',
        'X-API-KEY': mspKey,
        'X-App-ID': mspAppId,
      };

      const allMids = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId: signer.corporateId });
      const signable = (allMids || []).filter((m: any) =>
        m.mspApplicationNo && !DONE_MID_STATUSES.includes(m.applicationStepStatus)
      );

      const applications: any[] = [];
      for (const mid of signable) {
        const appNo = String(mid.mspApplicationNo);
        const { link, signed, status } = await fetchSignerLink(mspBase, mspHeaders, appNo, email);
        applications.push({
          mspApplicationNo: appNo,
          merchantName: mid.dbaName || mid.merchantName || `Agreement ${appNo}`,
          signingUrl: signed ? null : link,
          signed,
          status,
          error: !signed && !link
            ? 'Signing link not ready yet. The primary applicant may still be preparing documents — refresh in a moment.'
            : null,
        });
      }

      const allSigned = applications.length > 0 && applications.every((a: any) => a.signed);
      // If there are zero signable MIDs, surface a clear hint rather than an empty success
      if (applications.length === 0) {
        return Response.json({
          success: true,
          applications: [],
          allSigned: false,
          pendingPrep: true,
          hint: 'Agreements are still being prepared. Please wait for the primary applicant to open the signing step, then refresh this page.',
          signer: toSafeSigner(signer),
        });
      }

      return Response.json({
        success: true,
        applications,
        allSigned,
        signer: toSafeSigner(signer),
      });
    }

    if (action === 'markSigned') {
      if (isExpired(signer.verifyTokenSentAt)) {
        return Response.json({ error: 'This verification link has expired. Please ask the business to resend your invite.' }, { status: 410 });
      }
      if (isApplicationSigned(signer.identityStatus)) {
        return Response.json({ success: true, signer: toSafeSigner(signer) });
      }
      // Only allow verified → application signed (never skip KYC)
      if (normalizeLifecycle(signer.identityStatus) !== 'verified') {
        return Response.json({ error: 'Identity must be verified before marking signed.' }, { status: 409 });
      }
      const signedAt = new Date().toISOString();
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signer.id, {
        identityStatus: 'application signed',
        signedAt,
      });
      return Response.json({ success: true, signer: toSafeSigner(updated) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
