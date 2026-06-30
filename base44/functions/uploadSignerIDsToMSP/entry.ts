import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY not set' }, { status: 500 });

    const mspHeaders = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json' };

    // Load signers and concepts
    const [signers, concepts] = await Promise.all([
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantProcessingConcept.filter({ corporateId }),
    ]);

    // Filter signers that have an uploaded ID document
    const signersWithIds = (signers || []).filter((s: any) => s.idDocumentUrl);
    if (signersWithIds.length === 0) {
      return Response.json({ success: false, error: 'No signers have uploaded ID documents.' });
    }

    // Determine which application numbers to upload to
    let targetApps: string[] = applicationNos || [];
    if (targetApps.length === 0) {
      // Default: all concepts that have an MSP application number and are not yet Active
      targetApps = (concepts || [])
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