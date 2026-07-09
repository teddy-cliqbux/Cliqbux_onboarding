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


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { corporateId, fileUrl } = body;

    if (!corporateId || !fileUrl) {
      return Response.json({ error: 'corporateId and fileUrl are required' }, { status: 400 });
    }

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
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