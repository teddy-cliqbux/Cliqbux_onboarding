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


// uploadSignerIDsToMSP
// Fetches each signer's uploaded ID document URL, downloads it,
// and POSTs it to MSPWare as a multipart file upload for each application.
//
// POST /functions/uploadSignerIDsToMSP
// Body: { corporateId, applicationNos?: string[] }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, applicationNos } = body;

    if (!corporateId) return Response.json({ error: 'corporateId is required' }, { status: 400 });

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY not set' }, { status: 500 });

    const mspHeaders = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json' };

    // Load signers and merchantMIDs
    const [signers, merchantMIDs] = await Promise.all([
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantMID.filter({ corporateId }),
    ]);

    // Filter signers that have an uploaded ID document
    const signersWithIds = (signers || []).filter((s: any) => s.idDocumentUrl);
    if (signersWithIds.length === 0) {
      return Response.json({ success: false, error: 'No signers have uploaded ID documents.' });
    }

    // Determine which application numbers to upload to
    let targetApps: string[] = applicationNos || [];
    if (targetApps.length === 0) {
      // Default: all merchantMIDs that have an MSP application number and are not yet Active
      targetApps = (merchantMIDs || [])
        .filter((c: any) => c.mspApplicationNo && !['Active', 'Active (Existing)'].includes(c.applicationStepStatus))
        .map((c: any) => String(c.mspApplicationNo));
    }

    if (targetApps.length === 0) {
      return Response.json({ success: false, error: 'No MSPWare application numbers found. Submit applications first.' });
    }

    const results: any[] = [];

    for (const appNo of targetApps) {
      const appResults: any[] = [];

      for (const signer of signersWithIds) {
        const signerName = `${signer.firstName} ${signer.lastName}`.trim();
        const docUrl: string = signer.idDocumentUrl;

        try {
          // Download the ID document
          const fileRes = await fetch(docUrl);
          if (!fileRes.ok) {
            appResults.push({ signer: signerName, status: 'error', error: `Failed to download ID document (HTTP ${fileRes.status})` });
            continue;
          }

          const fileBlob = await fileRes.blob();
          const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';

          // Derive a filename from the URL or use a default
          const urlPath = docUrl.split('?')[0];
          const rawName = urlPath.split('/').pop() || 'id-document';
          // Ensure the filename has an extension
          const ext = rawName.includes('.') ? '' : (contentType.includes('pdf') ? '.pdf' : contentType.includes('png') ? '.png' : '.jpg');
          const fileName = `${signerName.replace(/\s+/g, '_')}_ID${ext || ('.' + rawName.split('.').pop())}`;

          // Build multipart form data
          const formData = new FormData();
          formData.append('file', fileBlob, fileName);
          // document_type may be needed — try 'ID' as a common value
          formData.append('document_type', 'ID');
          formData.append('description', `Government ID — ${signerName}`);

          const uploadRes = await fetch(`${mspBase}/applications/${appNo}/documents`, {
            method: 'POST',
            headers: mspHeaders, // No Content-Type — browser sets multipart boundary automatically
            body: formData,
          });

          const uploadBody = await uploadRes.json().catch(() => ({})) as any;
          console.log(`[uploadSignerIDsToMSP] app=${appNo} signer="${signerName}" HTTP=${uploadRes.status}:`, JSON.stringify(uploadBody));

          appResults.push({
            signer: signerName,
            fileName,
            status: uploadRes.ok && uploadBody?.success !== false ? 'uploaded' : 'error',
            httpStatus: uploadRes.status,
            response: uploadBody,
          });

        } catch (err: any) {
          console.error(`[uploadSignerIDsToMSP] Exception for signer "${signerName}" app ${appNo}:`, err.message);
          appResults.push({ signer: signerName, status: 'error', error: err.message });
        }
      }

      results.push({ applicationNo: appNo, uploads: appResults });
    }

    const allOk = results.every(r => r.uploads.every((u: any) => u.status === 'uploaded'));
    return Response.json({ success: allOk, corporateId, results });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});