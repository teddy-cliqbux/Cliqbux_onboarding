import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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
      const record = await base44.asServiceRole.entities.MerchantSigners.create({
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

      if (sendInvite) {
        const verifyUrl = `${Deno.env.get('PUBLIC_APP_URL') || 'https://onboarding.cliqbux.com'}/verify?token=${token}`;
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: signerData.signerEmail,
          subject: `Action Required: Complete Your Identity Verification for ${signerData.legalName || 'Cliqbux'}`,
          body: `
Hello ${signerData.firstName},

You have been added as a beneficial owner / authorized signer for a merchant application.

Please complete your identity verification using the secure link below:

${verifyUrl}

This link is unique to you. Please do not share it.

If you have questions, contact your Cliqbux representative.

— The Cliqbux Team
          `.trim()
        });
        await base44.asServiceRole.entities.MerchantSigners.update(record.id, { identityStatus: 'Sent' });
        record.identityStatus = 'Sent';
      }

      return Response.json({ success: true, signer: record });
    }

    // --- UPDATE ---
    if (action === 'update') {
      if (!signerId) return Response.json({ error: 'signerId required' }, { status: 400 });
      const ALLOWED = ['firstName','lastName','signerEmail','ownershipPercentage','isPrimarySigner',
        'identityStatus','dobYear','dobMonth','dobDay','ssn','homeStreet','homeCity','homeState','homeZip','corporatePhone'];
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
      const verifyUrl = `${Deno.env.get('PUBLIC_APP_URL') || 'https://onboarding.cliqbux.com'}/verify?token=${token}`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: signer.signerEmail,
        subject: `Action Required: Complete Your Identity Verification`,
        body: `
Hello ${signer.firstName},

Please complete your identity verification using the secure link below:

${verifyUrl}

This link is unique to you. Please do not share it.

— The Cliqbux Team
        `.trim()
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
      const signers = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      return Response.json({ success: true, signers });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});