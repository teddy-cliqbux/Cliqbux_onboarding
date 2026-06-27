import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── signApplication ──────────────────────────────────────────────────────────
// Packages ALL pending MSPWare applications for a corporateId for e-signature
// and returns signing URLs per concept, in order.
//
// Flow:
//   1. Load all MerchantProcessingConcept records for corporateId
//   2. Filter to those with an mspApplicationNo that aren't already Active
//   3. For each: GET /signatures → create package if needed → GET /signatures/link
//   4. Return ordered array of applications with signing URLs + overall state
//
// The UI uses this to show iframes sequentially — one agreement per concept.
// Poll by calling again with the same corporateId; allSigned flips true when done.
//
// POST /functions/signApplication
// Body: { corporateId }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const body = await req.json();
    const { corporateId } = body;

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

    // ── 1. Load profile, signers, and all concepts ────────────────────────────
    const [profiles, signers, allConcepts] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantProcessingConcept.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

    const primarySigner = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0];
    const primaryEmail  = primarySigner?.signerEmail || profile.signerEmail;

    if (!primaryEmail) {
      return Response.json({ error: 'No signer email found on profile or signers' }, { status: 400 });
    }

    // ── 2. Filter to signable concepts ────────────────────────────────────────
    // Signable = has mspApplicationNo and is not already fully boarded
    const DONE_STATUSES = ['Active', 'Active (Existing)', 'Pending MID'];
    const signable = (allConcepts || []).filter((c: any) =>
      c.mspApplicationNo && !DONE_STATUSES.includes(c.applicationStepStatus)
    );

    if (signable.length === 0) {
      return Response.json({
        error: 'No signable concepts found. Make sure submitToMSP has been called first.',
        hint: 'Call submitToMSP to create MSPWare draft applications before requesting signatures.',
      }, { status: 404 });
    }

    console.log(`[signApplication] corporateId=${corporateId} signable concepts: ${signable.length}`);

    // ── 3. Process each concept ───────────────────────────────────────────────
    const applications: any[] = [];

    for (const concept of signable) {
      const mspApplicationNo = concept.mspApplicationNo;
      const conceptName = concept.dbaName || concept.conceptName || `Concept ${mspApplicationNo}`;

      console.log(`[signApplication] Processing app ${mspApplicationNo} (${conceptName})`);

      // Check existing signing package
      const statusRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
        headers: mspHeaders,
      });
      const statusData = await statusRes.json();

      let packageExists = statusRes.ok && statusData?.success && statusData?.signers?.length > 0;

      // Create package if not yet done
      if (!packageExists) {
        console.log(`[signApplication] Creating signature package for app ${mspApplicationNo}`);
        const packageRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
          method: 'POST',
          headers: mspHeaders,
          body: JSON.stringify({ sendEmail: false }),
        });
        const packageData = await packageRes.json();
        console.log(`[signApplication] POST /signatures ${packageRes.status}:`, JSON.stringify(packageData));

        if (!packageRes.ok || !packageData?.success) {
          const errMsg = packageData?.error || packageData?.message || `HTTP ${packageRes.status}`;
          // Form not 100% complete — record the error but continue processing other concepts
          applications.push({
            mspApplicationNo,
            conceptName,
            signingUrl: null,
            signers: [],
            allSigned: false,
            error: `Application form incomplete: ${errMsg}`,
            hint: 'Ensure all required fields are filled (bank account, SSN, DOB, addresses).',
          });
          continue;
        }

        packageExists = true;
      }

      // Re-fetch to get current signer list with statuses
      const freshRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/signatures`, {
        headers: mspHeaders,
      });
      const freshData = await freshRes.json();
      const signerList: any[] = freshData?.signers || [];
      const overallSigned = freshData?.signed === true || freshData?.status === 'complete';

      // Get signing link for each signer; track primary
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

      // Fallback: try primaryEmail directly if not found in signer list
      if (!primarySigningUrl) {
        const fallbackRes = await fetch(
          `${mspBase}/applications/${mspApplicationNo}/signatures/link?emailAddress=${encodeURIComponent(primaryEmail)}`,
          { headers: mspHeaders }
        );
        const fallbackData = await fallbackRes.json();
        primarySigningUrl = fallbackData?.link || null;
      }

      const appAllSigned = signerList.length > 0 && signerList.every((s: any) =>
        ['signed', 'complete', 'completed'].includes((s.localstatus || s.status || '').toLowerCase())
      );

      applications.push({
        mspApplicationNo,
        conceptName,
        signingUrl: primarySigningUrl,
        signers: signerLinks,
        allSigned: appAllSigned || overallSigned,
        error: null,
      });
    }

    const totalCount  = applications.length;
    const totalSigned = applications.filter((a: any) => a.allSigned).length;
    const allSigned   = totalCount > 0 && totalSigned === totalCount;

    console.log(`[signApplication] Done. ${totalSigned}/${totalCount} signed.`);

    return Response.json({
      success: true,
      primaryEmail,
      applications,   // ordered array — UI works through these in sequence
      totalCount,
      totalSigned,
      allSigned,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
