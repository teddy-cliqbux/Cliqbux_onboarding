import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── Merchant Portal Auth Helper (inlined) ────────────────────────────────────
// Base44 bundles each function in isolation — relative imports can't reach
// outside functions/{name}/, so this is duplicated from base44/functions/helpers/auth.ts
// rather than imported. Keep both copies in sync if the signing logic changes.
// See that file for verifyMerchantToken and full documentation.

interface MerchantTokenPayload {
  corporateId: string;
  email?: string;
  exp: number; // unix seconds
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getHmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const secret = Deno.env.get('MERCHANT_JWT_SECRET');
  if (!secret) throw new Error('MERCHANT_JWT_SECRET env var not set');
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

async function signMerchantToken(
  corporateId: string,
  email: string | undefined,
  expiresAt: string
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000);
  const payload: MerchantTokenPayload = { corporateId, email, exp };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await getHmacKey('sign');
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));

  return `${signingInput}.${encodedSignature}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const {
      businessName, signerName, signerEmail, pricingTier,
      corporatePhone
    } = body;

    if (!businessName || !signerName || !signerEmail || !pricingTier) {
      return Response.json({ error: 'Missing required fields: businessName, signerName, signerEmail, pricingTier' }, { status: 400 });
    }

    const hsApiKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsApiKey) {
      return Response.json({ error: 'HUBSPOT_API_KEY is not configured in Base44 environment variables' }, { status: 500 });
    }

    const headers = {
      'Authorization': `Bearer ${hsApiKey}`,
      'Content-Type': 'application/json'
    };

    // 1. Create or find Contact — treat 409 (duplicate email) as success
    let contactId: string | null = null;
    try {
      const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          properties: {
            email: signerEmail,
            firstname: signerName.split(' ')[0] || signerName,
            lastname: signerName.split(' ').slice(1).join(' ') || '',
          }
        })
      });
      const contactData = await contactRes.json();
      if (contactRes.ok) {
        contactId = contactData.id || null;
      } else if (contactRes.status === 409) {
        // Contact already exists — extract id from error and continue
        contactId = contactData.error === 'CONTACT_EXISTS' ? (contactData.identityProfile?.vid?.toString() || null) : null;
      }
    } catch (_) { /* contact creation is best-effort */ }

    // 2. Create Company — only use standard, safe HubSpot properties
    const companyRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          name: businessName,
          domain: signerEmail.split('@')[1] || ''
        }
      })
    });
    const companyData = await companyRes.json();

    let companyId: string | null = null;
    if (companyRes.ok) {
      companyId = companyData.id;
    } else if (companyRes.status === 409) {
      // Company with this domain already exists — search for it
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/companies/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filterGroups: [{
            filters: [{ propertyName: 'domain', operator: 'EQ', value: signerEmail.split('@')[1] || '' }]
          }],
          limit: 1
        })
      });
      const searchData = await searchRes.json();
      companyId = searchData.results?.[0]?.id || null;
    }

    if (!companyId) {
      return Response.json({
        error: 'Failed to create or find HubSpot company',
        hubspotStatus: companyRes.status,
        hubspotError: companyData
      }, { status: 500 });
    }

    // 3. Create Deal
    const dealRes = await fetch('https://api.hubapi.com/crm/v3/objects/deals', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        properties: {
          dealname: `${businessName} — Self-Serve Onboarding`,
          dealstage: 'appointmentscheduled',
          pipeline: 'default',
          amount: '0',
          closedate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      })
    });
    const dealData = await dealRes.json();
    const dealId = dealData.id;

    if (!dealId) {
      return Response.json({
        error: 'Failed to create HubSpot deal',
        hubspotStatus: dealRes.status,
        hubspotError: dealData
      }, { status: 500 });
    }

    // 4. Associate deal with company and contact (best-effort)
    await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/companies/${companyId}/deal_to_company`, { method: 'PUT', headers });
    if (contactId) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, { method: 'PUT', headers });
    }

    // 5. Create MerchantCorporateProfile in Base44
    const corporateId = dealId;
    const existing = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });

    if (!existing || existing.length === 0) {
      const profileFields: Record<string, unknown> = {
        corporateId,
        legalName: businessName,
        signerEmail,
        pricingTier,
        applicationStatus: 'Pricing Selected',
        firstName: signerName.split(' ')[0] || signerName,
        lastName: signerName.split(' ').slice(1).join(' ') || '',
      };

      if (corporatePhone) profileFields.corporatePhone = corporatePhone.replace(/\D/g, '');

      await base44.asServiceRole.entities.MerchantCorporateProfile.create(profileFields);
    }

    // Mint a merchant-portal session token for this self-serve signup, same as
    // validateResumeToken does for magic-link resumes. Without this, self-serve
    // merchants have no way to prove ownership of their own corporateId after
    // a page refresh — they'd need to request a resume-by-email link every time.
    // 7-day TTL matches the resume-link TTL (sendResumeLink's TOKEN_TTL_DAYS).
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const merchantToken = await signMerchantToken(corporateId, signerEmail, expiresAt);

    return Response.json({ success: true, corporateId, dealId, companyId, contactId, merchantToken });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});