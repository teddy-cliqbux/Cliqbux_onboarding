import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { businessName, signerName, signerEmail, pricingTier } = body;

    if (!businessName || !signerName || !signerEmail || !pricingTier) {
      return Response.json({ error: 'Missing required fields: businessName, signerName, signerEmail, pricingTier' }, { status: 400 });
    }

    const hsApiKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsApiKey) {
      return Response.json({ error: 'HubSpot API key not configured' }, { status: 500 });
    }

    const headers = {
      'Authorization': `Bearer ${hsApiKey}`,
      'Content-Type': 'application/json'
    };

    // 1. Create or find Contact
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
    const contactId = contactData.id || null;

    // 2. Create Company
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
    const companyId = companyData.id;

    if (!companyId) {
      return Response.json({ error: 'Failed to create HubSpot company', details: companyData }, { status: 500 });
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
      return Response.json({ error: 'Failed to create HubSpot deal', details: dealData }, { status: 500 });
    }

    // 4. Associate deal with company
    await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/companies/${companyId}/deal_to_company`, {
      method: 'PUT',
      headers
    });

    // 5. Associate deal with contact if created
    if (contactId) {
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, {
        method: 'PUT',
        headers
      });
    }

    // 6. Create MerchantCorporateProfile in Base44
    const corporateId = dealId;
    const existing = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });

    if (!existing || existing.length === 0) {
      await base44.asServiceRole.entities.MerchantCorporateProfile.create({
        corporateId,
        legalName: businessName,
        signerEmail,
        pricingTier,
        applicationStatus: 'Pricing Selected'
      });
    }

    return Response.json({
      success: true,
      corporateId,
      dealId,
      companyId,
      contactId
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});