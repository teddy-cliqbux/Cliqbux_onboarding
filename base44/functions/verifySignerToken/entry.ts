import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// verifySignerToken — powers the public /verify page (src/pages/VerifyIdentity.jsx)
// for INVITED (non-primary) signers completing their own identity verification
// remotely, with no Base44 session and no corporateId — only the token from
<<<<<<< HEAD
// their email link. This function existed in the local repo but had never been
// deployed to the live Base44 app (2026-07-08 — confirmed via direct API pull that
// the live app returned "function not found" while the local file already had a
// draft implementation). Rebuilt with token expiry enforcement and pushed live.
// See AGENTS.md.
=======
// their email link. This function was missing entirely (2026-07-08): the /verify
// page has always called it, but it never existed, so every invited signer's
// link was a dead end. See AGENTS.md.
>>>>>>> 7e74221a6c0a4dcad8ace99ffbb9b13045ef8039
//
// Actions:
//   get  — { token } -> { signer, legalName }            (safe fields only)
//   save — { token, signerData } -> { signer }            (validates + marks Verified)
//
// POST /functions/verifySignerToken

const TOKEN_TTL_DAYS = 7;

function isExpired(sentAt: string | undefined): boolean {
  if (!sentAt) return false; // no timestamp on record (e.g. legacy/manually-created) — don't lock people out
  const sentMs = new Date(sentAt).getTime();
  if (Number.isNaN(sentMs)) return false;
  return Date.now() - sentMs > TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// Only the fields VerifyIdentity.jsx actually needs to render — never return
// the full record's internal bookkeeping (verifyToken itself, etc.) to the client.
function toSafeSigner(s: any) {
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    identityStatus: s.identityStatus,
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

      return Response.json({ success: true, signer: toSafeSigner(signer), legalName });
    }

    if (action === 'save') {
      if (isExpired(signer.verifyTokenSentAt)) {
        return Response.json({ error: 'This verification link has expired. Please ask the business to resend your invite.' }, { status: 410 });
      }
      if (signer.identityStatus === 'Verified') {
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
        identityStatus: 'Verified',
      };
      if (signerData?.firstName) update.firstName = signerData.firstName;
      if (signerData?.lastName) update.lastName = signerData.lastName;
      if (signerData?.corporatePhone !== undefined) update.corporatePhone = signerData.corporatePhone;

      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signer.id, update);
      return Response.json({ success: true, signer: toSafeSigner(updated) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
