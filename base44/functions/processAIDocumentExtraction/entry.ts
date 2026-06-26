import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { corporateId, fileUrl } = body;

    if (!corporateId || !fileUrl) {
      return Response.json({ error: 'corporateId and fileUrl are required' }, { status: 400 });
    }

    // Verify corporate profile exists
    const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    if (!profiles || profiles.length === 0) {
      return Response.json({ error: 'Merchant profile not found' }, { status: 404 });
    }
    const profile = profiles[0];

    // Call Base44 AI to extract banking/tax data from the document
    const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are a financial document parser. Carefully analyze this document and extract the following information:
1. Federal Tax ID / EIN (format: XX-XXXXXXX or 9 digits)
2. Bank routing number (exactly 9 digits)
3. Bank account number (8-17 digits typically)

Return a JSON object with exactly these keys: taxId, routingNumber, accountNumber.
If a field cannot be found or determined with confidence, return null for that field.
Do not guess or fabricate values. Only return values you can clearly identify in the document.`,
      file_urls: [fileUrl],
      response_json_schema: {
        type: "object",
        properties: {
          taxId: { type: "string" },
          routingNumber: { type: "string" },
          accountNumber: { type: "string" }
        }
      }
    });

    // Save taxId to corporate profile if extracted
    if (aiResult && aiResult.taxId) {
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, {
        taxId: aiResult.taxId
      });
    }

    return Response.json({
      success: true,
      extracted: {
        taxId: aiResult?.taxId || null,
        routingNumber: aiResult?.routingNumber || null,
        accountNumber: aiResult?.accountNumber || null
      },
      taxIdSaved: !!aiResult?.taxId
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});