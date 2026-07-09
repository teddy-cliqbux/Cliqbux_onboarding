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
    const { publicToken, accountId, identityVerificationId } = body;

    const actor = await getPortalActor(req, base44);
    if (!actor) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');
    const plaidEnv = 'sandbox';

    const plaidPost = (endpoint, payload) =>
      fetch(`https://${plaidEnv}.plaid.com${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: plaidClientId, secret: plaidSecret, ...payload })
      }).then(r => r.json());

    // --- IDV-only path: fetch identity verification result ---
    if (identityVerificationId && !publicToken) {
      const idvData = await plaidPost('/identity_verification/get', {
        identity_verification_id: identityVerificationId
      });

      if (idvData.error_code) {
        return Response.json({ error: idvData.error_message }, { status: 400 });
      }

      const u = idvData.user || {};
      const dob = u.date_of_birth || ''; // "YYYY-MM-DD"
      const [dobYear = '', dobMonth = '', dobDay = ''] = dob.split('-');

      const identity = {
        firstName: u.name?.given_name || '',
        lastName: u.name?.family_name || '',
        dobYear,
        dobMonth,
        dobDay,
        ssn: u.id_number?.value || '',
        homeStreet: u.address?.street_1 || '',
        homeCity: u.address?.city || '',
        homeState: u.address?.region || '',
        homeZip: u.address?.postal_code || '',
      };

      return Response.json({ identity });
    }

    // --- Bank auth path (requires publicToken + accountId) ---
    if (!publicToken || !accountId) {
      return Response.json({ error: 'publicToken and accountId are required' }, { status: 400 });
    }

    const exchangeData = await plaidPost('/item/public_token/exchange', { public_token: publicToken });
    if (exchangeData.error_code) {
      return Response.json({ error: exchangeData.error_message }, { status: 400 });
    }

    const accessToken = exchangeData.access_token;

    const authData = await plaidPost('/auth/get', { access_token: accessToken });
    if (authData.error_code) {
      return Response.json({ error: authData.error_message }, { status: 400 });
    }

    const numbers = authData.numbers?.ach || [];
    const accounts = authData.accounts || [];

    const enriched = accounts.map(acct => {
      const numEntry = numbers.find(n => n.account_id === acct.account_id);
      return {
        accountId: acct.account_id,
        name: acct.name,
        officialName: acct.official_name,
        type: acct.type,
        subtype: acct.subtype,
        mask: acct.mask,
        routingNumber: numEntry?.routing || null,
        accountNumber: numEntry?.account || null
      };
    });

    return Response.json({ accounts: enriched });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});