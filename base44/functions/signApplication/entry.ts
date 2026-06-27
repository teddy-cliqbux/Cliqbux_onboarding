import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── signApplication ──────────────────────────────────────────────────────────
// Packages a completed MSPWare application for e-signature and returns signing
// URLs for each principal. Designed to be called from OnboardingVerification
// after the merchant has filled all required fields.
//
// Flow:
//   1. Resolve mspApplicationNo from MerchantProcessingConcept (or accept directly)
//   2. GET /signatures — check if a signing package already exists
//   3. POST /signatures — create package if not yet done (requires 100% complete form)
//   4. GET /signatures/link?emailAddress=... — get per-signer iframe-embeddable URL
//   5. Return signingUrl (primary signer), all signer statuses, and overall state
//
// The signing URL returned can be:
//   - Embedded directly in an <iframe> in the portal
//   - Opened in a new tab
//   - Re-fetched on each page load (links don't expire until 72h after last email send)
//
// After all signers complete, the caller should invoke submitToMSP with
// MSP_SUBMIT_ENABLED=true (or a dedicated submitApplication call) to push
// the signed application to Elavon.
//
// POST /functions/signApplication
// Body: { corporateId, conceptId?, mspApplicationNo? }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { corporateId, conceptId, mspApplicationNo: appNoOverride } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Accept':    'application/json',
      'Content-Type': 'application/json',
    };

    // ── 1. Resolve mspApplicationNo ───────────────────────────────────────────
    let mspApplicationNo = appNoOverride;

    if (!mspApplicationNo) {
      // Find the concept to sign. If conceptId provided, use that; otherwise
      // find the first concept for this corporateId that has an application number
      // and is not yet Active.
      const concepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({ corporateId });

      const target = conceptId
        ? concepts?.find((c: any) => c.id === conceptId)
        : concepts?.find((c: any) =>
            c.mspApplicationNo &&
            !['Active', 'Active (Existing)', 'Pending MID'].includes(c.applicationStepStatus)
          );

      if (!target) {
        return Response.json({
          error: 'No signable concept found. Make sure submitToMSP has been called first to create the MSPWare draft.',
          hint: 'Call submitToMSP to create the application draft before requesting signatures.',
        }, { status: 404 });
      }

      mspApplicationNo = target.mspApplicationNo;
      if (!mspApplicationNo) {
        return Response.json({
          error: 'Concept has no mspApplicationNo — submitToMSP must be called first.',
        }, { status: 400 });
      }
    }

    console.log(`[signApplication] corporateId=${corporateId} mspApplicationNo=${mspApplicationNo}`);

    // ── 2. Load profile to get primary signer email ───────────────────────────
    const [profiles, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

    const primarySigner = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0];
    const primaryEmail  = primarySigner?.signerEmail || profile.signerEmail;

    if (!primaryEmail) {
      return Response.json({ error: 'No signer email found on profile or signers' }, { status: 400 });
    }

    // ── 3. Check existing signature package ───────────────────────────────────
    const statusRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
      headers: mspHeaders,
    });
    const statusData = await statusRes.json();
    console.log(`[signApplication] GET /signatures status ${statusRes.status}:`, JSON.stringify(statusData));

    let packageExists = statusRes.ok && statusData?.success && statusData?.signers?.length > 0;

    // ── 4. Create signing package if needed ───────────────────────────────────
    if (!packageExists) {
      console.log(`[signApplication] No package found — creating signature package for app ${mspApplicationNo}`);
      const packageRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
        method: 'POST',
        headers: mspHeaders,
        body: JSON.stringify({ sendEmail: false }), // don't auto-email — we'll show the iframe
      });
      const packageData = await packageRes.json();
      console.log(`[signApplication] POST /signatures status ${packageRes.status}:`, JSON.stringify(packageData));

      if (!packageRes.ok || !packageData?.success) {
        const errMsg = packageData?.error || packageData?.message || `HTTP ${packageRes.status}`;
        // Common failure: form not 100% complete
        if (String(packageRes.status) === '400' || errMsg.toLowerCase().includes('complete')) {
          return Response.json({
            error: 'Application form is not yet complete enough to package for signing.',
            hint: 'Ensure all required fields are filled (bank account, SSN, DOB, addresses). Check submitToMSP form validation errors.',
            mspError: errMsg,
            mspApplicationNo,
          }, { status: 422 });
        }
        return Response.json({
          error: 'Failed to create signature package',
          mspError: errMsg,
          mspApplicationNo,
        }, { status: 500 });
      }

      packageExists = true;
    }

    // ── 5. Fetch per-signer signing links ─────────────────────────────────────
    // Re-fetch status to get current signer list with statuses
    const freshStatusRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
      headers: mspHeaders,
    });
    const freshStatus = await freshStatusRes.json();

    const signerList: any[] = freshStatus?.signers || [];
    const overallSigned = freshStatus?.signed === true || freshStatus?.status === 'complete';

    // Get signing link for primary signer (used in iframe)
    let primarySigningUrl: string | null = null;
    const signerLinks: any[] = [];

    for (const s of signerList) {
      const email = s.emailAddress || s.email || '';
      if (!email) continue;

      const linkRes = await fetch(
        `${mspBase}/applications/${mspApplicationNo}/signatures/link?emailAddress=${encodeURIComponent(email)}`,
        { headers: mspHeaders }
      );
      const linkData = await linkRes.json();
      const link = linkData?.link || null;

      signerLinks.push({
        email,
        name: s.name || '',
        status: s.localstatus || s.status || 'unknown',
        signed: ['signed', 'complete', 'completed'].includes((s.localstatus || s.status || '').toLowerCase()),
        signingUrl: link,
      });

      if (email.toLowerCase() === primaryEmail.toLowerCase() && link) {
        primarySigningUrl = link;
      }
    }

    // Fallback: if primaryEmail not in signer list (MSPWare uses form email, not portal email),
    // try fetching the link directly with the profile email
    if (!primarySigningUrl) {
      const fallbackRes = await fetch(
        `${mspBase}/applications/${mspApplicationNo}/signatures/link?emailAddress=${encodeURIComponent(primaryEmail)}`,
        { headers: mspHeaders }
      );
      const fallbackData = await fallbackRes.json();
      primarySigningUrl = fallbackData?.link || null;
      console.log(`[signApplication] Fallback link fetch for ${primaryEmail}: ${primarySigningUrl ? 'found' : 'not found'}`);
    }

    const allSigned = signerList.length > 0 && signerList.every(s =>
      ['signed', 'complete', 'completed'].includes((s.localstatus || s.status || '').toLowerCase())
    );

    console.log(`[signApplication] Done. primarySigningUrl=${primarySigningUrl} allSigned=${allSigned}`);

    return Response.json({
      success: true,
      mspApplicationNo,
      primaryEmail,
      primarySigningUrl,  // embed this in <iframe> in OnboardingVerification
      signers: signerLinks,
      allSigned: allSigned || overallSigned,
      packageExists,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
