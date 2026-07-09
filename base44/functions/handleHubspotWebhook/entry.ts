import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-09 — customAuthPerCard passthrough

// ─── handleHubspotWebhook ─────────────────────────────────────────────────────
// Receives events from HubSpot workflows and syncs state to Base44.
//
// Supported eventTypes:
//
//   demo_scheduled   — Deal stage → "Demo Scheduled"
//                      Creates a pre-populated MerchantCorporateProfile + location
//                      so the merchant's portal is ready and tailored when they arrive.
//                      HubSpot workflow should include all available fields in payload.
//
//   quote_signed     — Merchant signed the Cliqbux equipment quote.
//                      Updates applicationStatus → 'Quote Signed'.
//
//   (default)        — Legacy upsert: creates/updates profile from explicit fields.
//                      Used by older HubSpot workflow automations.
//
// ─── HubSpot Workflow Setup for demo_scheduled ───────────────────────────────
// Trigger: Deal property "Deal Stage" is changed to "Demo Scheduled"
// Action:  Send webhook → POST to this function URL
// Payload (use HubSpot personalization tokens):
// {
//   "eventType": "demo_scheduled",
//   "dealId":       "{{ deal.hs_object_id }}",
//   "dealName":     "{{ deal.dealname }}",
//   "amount":       "{{ deal.amount }}",
//   "quoteUrl":     "{{ deal.hs_quote_link }}",
//   "pricingTier":  "{{ deal.pricing_tier__ }}",   ← your custom deal property
//   "legalName":    "{{ company.name }}",
//   "industry":     "{{ company.industry }}",
//   "address":      "{{ company.address }}",
//   "city":         "{{ company.city }}",
//   "state":        "{{ company.state }}",
//   "zip":          "{{ company.zip }}",
//   "phone":        "{{ company.phone }}",
//   "firstName":    "{{ contact.firstname }}",
//   "lastName":     "{{ contact.lastname }}",
//   "email":        "{{ contact.email }}",
//   "contactPhone": "{{ contact.phone }}",
//   "jobTitle":     "{{ contact.jobtitle }}"
// }

// ─── Industry → Base44 industryClass mapping ─────────────────────────────────
function mapHubspotIndustry(industry: string): string {
  const s = (industry || '').toLowerCase();
  if (s.includes('restaurant') || s.includes('food') || s.includes('dining') || s.includes('café') || s.includes('cafe') || s.includes('bar')) return 'RESTAURANT';
  if (s.includes('grocery') || s.includes('supermarket') || s.includes('market')) return 'GROCERY';
  if (s.includes('hotel') || s.includes('lodging') || s.includes('hospitality') || s.includes('motel')) return 'HOTEL';
  if (s.includes('salon') || s.includes('beauty') || s.includes('spa') || s.includes('barber')) return 'SALON';
  if (s.includes('gym') || s.includes('fitness') || s.includes('health club')) return 'GYM';
  if (s.includes('health') || s.includes('medical') || s.includes('dental') || s.includes('clinic')) return 'HEALTH';
  if (s.includes('auto') || s.includes('car') || s.includes('vehicle')) return 'AUTO';
  if (s.includes('clothing') || s.includes('apparel') || s.includes('fashion')) return 'CLOTHING';
  if (s.includes('electronics') || s.includes('tech')) return 'ELECTRONICS';
  if (s.includes('furniture') || s.includes('home')) return 'FURNITURE';
  if (s.includes('ecommerce') || s.includes('e-commerce') || s.includes('online')) return 'ECOMMERCE';
  return 'RETAIL';
}

// ─── Industry → likely MCC code ───────────────────────────────────────────────
function industryToMcc(industryClass: string): string {
  const map: Record<string, string> = {
    'RESTAURANT': '5812',
    'GROCERY':    '5411A',
    'HOTEL':      '7011',
    'SALON':      '7230',
    'GYM':        '7941',
    'HEALTH':     '8099',
    'AUTO':       '5511',
    'CLOTHING':   '5691',
    'ELECTRONICS':'5732',
    'FURNITURE':  '5712',
    'ECOMMERCE':  '5999',
    'RETAIL':     '5999',
    'BAR':        '5813',
    'SERVICES':   '7299',
  };
  return map[industryClass] || '5999';
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const payload = await req.json();
    const { eventType } = payload;

    // ── Event: demo_scheduled ─────────────────────────────────────────────────
    if (eventType === 'demo_scheduled') {
      const {
        dealId,
        dealName,
        amount,
        quoteUrl,
        pricingTier,
        legalName,
        industry,
        address,
        city,
        state,
        zip,
        phone,
        firstName,
        lastName,
        email,
        contactPhone,
        jobTitle,
      } = payload;

      if (!dealId || !email) {
        return Response.json({ error: 'demo_scheduled requires dealId and email' }, { status: 400 });
      }

      const name = legalName || dealName || 'New Merchant';
      const industryClass = mapHubspotIndustry(industry || '');
      const mccCode = industryToMcc(industryClass);
      const signerPhone = contactPhone || phone || '';

      // Idempotent — don't overwrite an existing profile's progress
      const existing = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: dealId });

      if (existing?.length) {
        // Profile already exists — just sync HubSpot fields that may have changed,
        // but don't touch applicationStatus or any onboarding progress
        await base44.asServiceRole.entities.MerchantCorporateProfile.update(existing[0].id, {
          legalName: name,
          signerEmail: email,
          hubspotQuoteUrl: quoteUrl || existing[0].hubspotQuoteUrl,
          pricingTier: pricingTier || existing[0].pricingTier,
        });
        console.log(`[handleHubspotWebhook] demo_scheduled: profile already exists for deal ${dealId}, refreshed key fields`);
        return Response.json({
          success: true,
          action: 'refreshed',
          corporateId: dealId,
          portalUrl: `https://cliqbux-onboard-prime.base44.app/?cid=${dealId}`,
        });
      }

      // Create fresh pre-populated profile
      const profile = await base44.asServiceRole.entities.MerchantCorporateProfile.create({
        corporateId:    dealId,
        legalName:      name,
        signerEmail:    email,
        firstName:      firstName || '',
        lastName:       lastName  || '',
        corporatePhone: signerPhone.replace(/\D/g, ''),
        titleType:      jobTitle ? mapJobTitle(jobTitle) : 'PROPRIETOR_OR_OWNER',
        industryClass,
        mccCode,
        hubspotQuoteUrl: quoteUrl || '',
        // 2026-07-06: no longer defaulting to a guessed tier here — 'Standard' isn't
        // a valid pricingTier value anymore (see AGENTS.md Critical Lesson #12), and
        // guessing CUSTOM_FLAT_RATE vs CUSTOM_INTERCHANGE_PLUS for a demo-scheduled
        // deal that hasn't been priced yet would be wrong either way. Leave unset
        // until pricing is actually decided.
        ...(pricingTier ? { pricingTier } : {}),
        applicationStatus: 'Incomplete',
        // Seed financial defaults so the form feels pre-filled
        monthlyCardSales:    estimateMonthlyCardSales(amount),
        annualRevenue:       amount ? String(parseFloat(amount) * 12) : '',
      });

      // Pre-create synthetic legal entity
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(profile.id, {
        legalEntities: [{
          entityId:          `ent-${dealId}`,
          legalBusinessName: name,
          federalEIN:        '',
        }],
      });

      // Pre-create first location from company address if we have one
      if (address && city) {
        await base44.asServiceRole.entities.MerchantLocations.create({
          corporateId:     dealId,
          dbaName:         name,
          businessStreet:  address,
          businessCity:    city,
          businessState:   state || '',
          businessZip:     zip   || '',
          businessAddress: [address, city, state, zip].filter(Boolean).join(', '),
          entityId:        `ent-${dealId}`,
          applicationStepStatus: 'In Review',
        });
        console.log(`[handleHubspotWebhook] demo_scheduled: pre-created location for "${name}" in ${city}, ${state}`);
      }

      const portalUrl = `https://cliqbux-onboard-prime.base44.app/?cid=${dealId}`;
      console.log(`[handleHubspotWebhook] demo_scheduled: provisioned portal for "${name}" (deal ${dealId}) → ${portalUrl}`);

      return Response.json({
        success:     true,
        action:      'provisioned',
        corporateId: dealId,
        legalName:   name,
        industryClass,
        mccCode,
        locationCreated: !!(address && city),
        portalUrl,
        // Include this URL in your HubSpot follow-up email template
        message: `Portal is ready. Send merchant to: ${portalUrl}`,
      });
    }

    // ── Event: quote_signed ───────────────────────────────────────────────────
    if (eventType === 'quote_signed') {
      const { dealId } = payload;
      if (!dealId) return Response.json({ error: 'quote_signed requires dealId' }, { status: 400 });

      const existing = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: dealId });
      if (!existing?.length) return Response.json({ error: 'Corporate profile not found' }, { status: 404 });

      await base44.asServiceRole.entities.MerchantCorporateProfile.update(existing[0].id, {
        applicationStatus: 'Quote Signed',
      });

      return Response.json({ success: true, action: 'status_updated', status: 'Quote Signed' });
    }

    // ── Legacy default: explicit-field upsert ─────────────────────────────────
    const {
      dealId,
      legalName,
      signerEmail,
      hubspotQuoteUrl,
      pricingTier,
      customMarkupPercentage,
      customPerTxFee,
      customAuthPerCard,
      firstName,
      lastName,
      locations = [],
    } = payload;

    if (!dealId || !legalName || !signerEmail) {
      return Response.json({ error: 'Missing required fields: dealId, legalName, signerEmail' }, { status: 400 });
    }

    const existingProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId: dealId });

    let profileId: string;
    if (existingProfiles?.length) {
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(existingProfiles[0].id, {
        legalName,
        signerEmail,
        hubspotQuoteUrl: hubspotQuoteUrl || existingProfiles[0].hubspotQuoteUrl,
        pricingTier:     pricingTier     || existingProfiles[0].pricingTier,
        customMarkupPercentage: customMarkupPercentage ?? existingProfiles[0].customMarkupPercentage,
        customPerTxFee:         customPerTxFee         ?? existingProfiles[0].customPerTxFee,
        customAuthPerCard:      customAuthPerCard      ?? existingProfiles[0].customAuthPerCard,
      });
      profileId = existingProfiles[0].id;
    } else {
      const created = await base44.asServiceRole.entities.MerchantCorporateProfile.create({
        corporateId:   dealId,
        legalName,
        signerEmail,
        firstName:     (firstName || legalName).split(' ')[0],
        lastName:      (lastName  || legalName).split(' ').slice(1).join(' '),
        hubspotQuoteUrl: hubspotQuoteUrl || '',
        // 2026-07-06: no longer defaulting to a guessed tier — see comment above
        // in the demo_scheduled path. See AGENTS.md Critical Lesson #12.
        ...(pricingTier ? { pricingTier } : {}),
        customMarkupPercentage: customMarkupPercentage || null,
        customPerTxFee:         customPerTxFee         || null,
        customAuthPerCard:      customAuthPerCard      || null,
        applicationStatus: 'Incomplete',
      });
      profileId = created.id;
      await base44.asServiceRole.entities.MerchantCorporateProfile.update(created.id, {
        legalEntities: [{ entityId: `ent-${dealId}`, legalBusinessName: legalName, federalEIN: '' }],
      });
    }

    const locationResults = [];
    for (const loc of locations) {
      const { dbaName, businessAddress } = loc;
      if (!dbaName || !businessAddress) continue;
      const existingLocs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId: dealId, dbaName });
      if (existingLocs?.length) {
        await base44.asServiceRole.entities.MerchantLocations.update(existingLocs[0].id, {
          businessAddress,
          ...(!existingLocs[0].entityId ? { entityId: `ent-${dealId}` } : {}),
        });
        locationResults.push({ dbaName, action: 'updated' });
      } else {
        await base44.asServiceRole.entities.MerchantLocations.create({
          corporateId: dealId,
          dbaName,
          businessAddress,
          entityId: `ent-${dealId}`,
          applicationStepStatus: 'In Review',
        });
        locationResults.push({ dbaName, action: 'created' });
      }
    }

    return Response.json({
      success: true,
      corporateId: dealId,
      locationsProcessed: locationResults.length,
      locations: locationResults,
    });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapJobTitle(title: string): string {
  const t = (title || '').toLowerCase();
  if (t.includes('ceo') || t.includes('chief executive'))  return 'CHIEF_EXECUTIVE_OFFICER';
  if (t.includes('cfo') || t.includes('chief financial'))  return 'CHIEF_FINANCIAL_OFFICER';
  if (t.includes('president'))                             return 'PRESIDENT';
  if (t.includes('owner') || t.includes('proprietor'))    return 'PROPRIETOR_OR_OWNER';
  if (t.includes('partner'))                              return 'PARTNER_OR_PRINCIPAL';
  if (t.includes('manager') || t.includes('general mgr')) return 'GENERAL_MANAGER';
  if (t.includes('director'))                             return 'DIRECTOR';
  if (t.includes('treasurer'))                            return 'TREASURER';
  if (t.includes('secretary'))                            return 'SECRETARY';
  if (t.includes('member'))                               return 'MANAGING_MEMBER';
  return 'PROPRIETOR_OR_OWNER';
}

// Rough monthly card sales estimate from deal amount (equipment deal value)
// Treat deal amount as annual card volume estimate if > 1000, else use a safe default
function estimateMonthlyCardSales(amount: string | undefined): string {
  const v = parseFloat(amount || '0');
  if (v > 10000) return String(Math.round(v / 12));
  return '5000';  // safe default
}