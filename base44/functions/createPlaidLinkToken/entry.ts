import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId } = body;

    const plaidClientId = Deno.env.get('PLAID_CLIENT_ID');
    const plaidSecret = Deno.env.get('PLAID_SECRET');

    if (!plaidClientId || !plaidSecret) {
      return Response.json({ error: 'Plaid credentials not configured' }, { status: 500 });
    }

    // Determine environment: if secret looks like sandbox use sandbox, else production
    const plaidEnv = 'sandbox'; // Switch to 'production' when going live

    const response = await fetch(`https://${plaidEnv}.plaid.com/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        client_name: 'Cliqbux Merchant Onboarding',
        country_codes: ['US'],
        language: 'en',
        user: { client_user_id: corporateId || 'self_serve_user' },
        products: ['auth'],
        account_filters: {
          depository: { account_subtypes: ['checking', 'savings'] }
        }
      })
    });

    const data = await response.json();

    if (data.error_code) {
      return Response.json({ error: data.error_message || 'Plaid error', code: data.error_code }, { status: 400 });
    }

    return Response.json({ link_token: data.link_token });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});