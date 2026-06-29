import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, token, signerData } = body;

    if (!token) return Response.json({ error: 'token required' }, { status: 400 });

    // Find signer by token
    const all = await base44.asServiceRole.entities.MerchantSigners.filter({ verifyToken: token });
    if (!all || all.length === 0) return Response.json({ error: 'Invalid or expired verification link.' }, { status: 404 });
    const signer = all[0];

    // --- GET: return signer + corporate profile info ---
    if (action === 'get') {
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: signer.corporateId });
      const profile = profiles[0] || null;
      return Response.json({
        success: true,
        signer: {
          id: signer.id,
          firstName: signer.firstName,
          lastName: signer.lastName,
          signerEmail: signer.signerEmail,
          identityStatus: signer.identityStatus,
          corporateId: signer.corporateId,
          dobMonth: signer.dobMonth || '',
          dobDay: signer.dobDay || '',
          dobYear: signer.dobYear || '',
          ssn: signer.ssn || '',
          homeStreet: signer.homeStreet || '',
          homeCity: signer.homeCity || '',
          homeState: signer.homeState || '',
          homeZip: signer.homeZip || '',
          corporatePhone: signer.corporatePhone || '',
        },
        legalName: profile?.legalName || '',
        corporateId: signer.corporateId,
      });
    }

    // --- SAVE: write identity fields + mark Verified ---
    if (action === 'save') {
      const ALLOWED = ['firstName','lastName','dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone'];
      const update = { identityStatus: 'Verified' };
      for (const key of ALLOWED) {
        if (signerData && signerData[key] !== undefined) update[key] = signerData[key];
      }
      const updated = await base44.asServiceRole.entities.MerchantSigners.update(signer.id, update);
      return Response.json({ success: true, signer: updated });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});