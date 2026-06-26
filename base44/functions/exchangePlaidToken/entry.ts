import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { publicToken, accountId, identityVerificationId } = body;

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