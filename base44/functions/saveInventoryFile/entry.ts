import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, fileName, fileType, fileUrl, fileExtension } = body;

    if (!corporateId || !fileName || !fileType || !fileUrl) {
      return Response.json({ error: 'Missing required fields: corporateId, fileName, fileType, fileUrl' }, { status: 400 });
    }

    const created = await base44.asServiceRole.entities.MerchantInventoryAssets.create({
      corporateId,
      fileName,
      fileType,
      fileUrl,
      fileExtension: fileExtension || ''
    });

    return Response.json({ success: true, asset: { id: created.id, fileName, fileType } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});