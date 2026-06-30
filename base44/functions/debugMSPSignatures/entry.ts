import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { appNo, email } = body;

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey = Deno.env.get('MSP_APP_KEY') || '';
    const appId = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const headers = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json', 'Content-Type': 'application/json' };

    // GET signatures
    const sigRes = await fetch(`${mspBase}/applications/${appNo}/signatures`, { headers });
    const sigData = await sigRes.json();

    // GET link by email
    const linkRes = await fetch(`${mspBase}/applications/${appNo}/signatures/link?emailAddress=${encodeURIComponent(email || '')}`, { headers });
    const linkData = await linkRes.json();

    // Also try by signerid if present
    let signerIdLinkData = null;
    if (sigData?.signers?.length > 0) {
      const signerId = sigData.signers[0]?.signerid || sigData.signers[0]?.id;
      if (signerId) {
        const r = await fetch(`${mspBase}/applications/${appNo}/signatures/link?signerid=${signerId}`, { headers });
        signerIdLinkData = await r.json();
      }
    }

    return Response.json({
      signaturesStatus: sigRes.status,
      signatures: sigData,
      linkByEmailStatus: linkRes.status,
      linkByEmail: linkData,
      linkBySignerId: signerIdLinkData,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});