import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { publicToken, accountId } = body;

    if (!publicToken || !accountId) {
      return Response.json({ error: 'publicToken and accountId are required' }, { status: 400 });
    }

    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');
    const plaidEnv = 'sandbox';

    // Exchange public token for access token
    const exchangeRes = await fetch(`https://${plaidEnv}.plaid.com/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        public_token: publicToken
      })
    });
    const exchangeData = await exchangeRes.json();

    if (exchangeData.error_code) {
      return Response.json({ error: exchangeData.error_message }, { status: 400 });
    }

    const accessToken = exchangeData.access_token;

    // Fetch account auth details (routing + account numbers)
    const authRes = await fetch(`https://${plaidEnv}.plaid.com/auth/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        access_token: accessToken
      })
    });
    const authData = await authRes.json();

    if (authData.error_code) {
      return Response.json({ error: authData.error_message }, { status: 400 });
    }

    const numbers = authData.numbers?.ach || [];
    const accounts = authData.accounts || [];

    // Build enriched list of accounts with routing + account numbers
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