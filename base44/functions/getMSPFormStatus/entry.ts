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


// Returns the MSPWare form completion status for a specific application number.
// Used by the signing error guide to surface missing fields to the merchant.
// POST /functions/getMSPFormStatus
// Body: { corporateId, applicationNo }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const { applicationNo, formOnly } = body;
    if (!applicationNo) return Response.json({ error: 'applicationNo required' }, { status: 400 });

    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Merchant actors must own the application: corporateId comes from the
    // VERIFIED token (never the request body), and the applicationNo must
    // belong to one of that merchant's MIDs.
    if (actor.actor === 'merchant') {
      const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId: actor.corporateId });
      const owned = (merchantMIDs || []).some((c: any) => String(c.mspApplicationNo) === String(applicationNo));
      if (!owned) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY not set' }, { status: 500 });

    const headers = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Accept':    'application/json',
    };

    const formRes = await fetch(`${mspBase}/applications/${applicationNo}/form`, { headers });
    const formData = await formRes.json();

    // Signature probe can mutate MSPWare packages — skip for admin list health (formOnly: true).
    let signaturesError = null;
    if (!formOnly) {
      const sigRes = await fetch(`${mspBase}/applications/${applicationNo}/signatures`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendEmail: false }),
      });
      if (!sigRes.ok || !(await sigRes.clone().json().then((d: any) => d.success).catch(() => false))) {
        const sigData = await sigRes.json().catch(() => ({})) as any;
        signaturesError = sigData?.error || sigData?.message || `HTTP ${sigRes.status}`;
      }
    }

    return Response.json({
      success: formRes.ok,
      formOnly: !!formOnly,
      percent_complete: formData.percent_complete ?? null,
      canSave: formData.canSave ?? false,
      canSubmit: formData.canSubmit ?? null,
      completion_errors: formData.completion_errors || [],
      data_errors:       formData.data_errors       || [],
      rule_violations:   formData.rule_violations   || [],
      errors:            formData.errors            || [],
      signaturesError,
      // Full raw form for debugging — includes all fields currently on the application
      rawForm: formData.form || formData,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});