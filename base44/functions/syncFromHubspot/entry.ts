import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── syncFromHubspot ──────────────────────────────────────────────────────────
// Pulls a merchant's full HubSpot hierarchy into the onboarding portal entities.
//
// HubSpot data model → Base44 entity mapping:
//   Deal                     → identifies the merchant (corporateId = dealId)
//   Parent Company           → MerchantCorporateProfile (legal entity, EIN, ownership)
//   Child Companies          → MerchantLocations (one per physical location)
//   Child Company (1:1)      → MerchantProcessingConcept (one MID per location)
//   Associated Contact(s)    → MerchantSigners (primary signer)
//
// Idempotent — safe to run multiple times. Won't overwrite fields that already
// have onboarding progress (SSN, bank details, verified signer data).
//
// POST /functions/syncFromHubspot
// Body: { dealId, force? }
//   force: if true, refreshes all fields even if profile already exists

// ─── HubSpot custom property names ───────────────────────────────────────────
// These are the custom properties you define in HubSpot.
// Update these constants to match your actual HubSpot property internal names.
const HS_PROPS = {
  company: [
    'name', 'address', 'city', 'state', 'zip', 'phone', 'industry',
    'website', 'numberofemployees', 'hs_parent_company_id',
    // Custom properties — define these in HubSpot Settings → Properties
    'ein',                  // Federal EIN / TIN (9 digits)
    'ownership_type',       // LLC, CORPORATION, SOLE_PROP, etc.
    'state_of_formation',   // 2-letter state code
    'establishment_year',   // 4-digit year
    'mcc_code',             // 4-digit MCC (on child companies)
    'dba_name',             // DBA / trade name if different from company name
    'monthly_card_sales',   // estimated monthly card volume
    'avg_ticket',           // average transaction amount
    'card_present_pct',     // % of transactions that are card-present (0-100)
    'pricing_tier',         // TRADITIONAL, STANDARD, PREMIUM, CASH_DISCOUNT
    'pricing_method',       // ICPLS, CLEAR, FLAT
  ],
  contact: [
    'firstname', 'lastname', 'email', 'phone', 'jobtitle',
    'ownership_percent',    // Custom: beneficial ownership %
  ],
  deal: [
    'dealname', 'amount', 'dealstage', 'pipeline',
    'pricing_tier__',       // Custom: pricing tier on the deal
    'hs_quote_link',
  ],
};

// ─── Industry mapping (same as handleHubspotWebhook) ─────────────────────────
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

function industryToMcc(industryClass: string): string {
  const map: Record<string, string> = {
    'RESTAURANT': '5812', 'GROCERY': '5411', 'HOTEL': '7011',
    'SALON': '7230', 'GYM': '7941', 'HEALTH': '8099',
    'AUTO': '5511', 'CLOTHING': '5691', 'ELECTRONICS': '5732',
    'FURNITURE': '5712', 'ECOMMERCE': '5999', 'RETAIL': '5999',
    'BAR': '5813', 'SERVICES': '7299',
  };
  return map[industryClass] || '5999';
}

function mapJobTitle(title: string): string {
  const t = (title || '').toLowerCase();
  if (t.includes('ceo') || t.includes('chief executive'))  return 'CEO';
  if (t.includes('cfo') || t.includes('chief financial'))  return 'CFO';
  if (t.includes('coo'))                                   return 'COO';
  if (t.includes('president'))                             return 'PRESIDENT';
  if (t.includes('owner') || t.includes('proprietor'))    return 'OWNER';
  if (t.includes('partner'))                              return 'PARTNER';
  if (t.includes('manager'))                              return 'MANAGER';
  if (t.includes('director'))                             return 'DIRECTOR';
  if (t.includes('treasurer'))                            return 'TREASURER';
  if (t.includes('secretary'))                            return 'SECRETARY';
  if (t.includes('member'))                              return 'MANAGING_MEMBER';
  if (t.includes('vice president') || t.includes('vp'))  return 'VP';
  return 'OWNER';
}

// ─── HubSpot API helpers ──────────────────────────────────────────────────────
async function hsGet(path: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.hubapi.com${path}`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HubSpot GET ${path} → ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function getCompany(id: string, headers: Record<string, string>): Promise<any> {
  const props = HS_PROPS.company.join(',');
  const data = await hsGet(
    `/crm/v3/objects/companies/${id}?properties=${props}&associations=companies`,
    headers
  );
  return data;
}

async function getDealWithAssociations(dealId: string, headers: Record<string, string>): Promise<any> {
  const props = HS_PROPS.deal.join(',');
  const data = await hsGet(
    `/crm/v3/objects/deals/${dealId}?properties=${props}&associations=companies,contacts`,
    headers
  );
  return data;
}

async function getContact(id: string, headers: Record<string, string>): Promise<any> {
  const props = HS_PROPS.contact.join(',');
  return hsGet(`/crm/v3/objects/contacts/${id}?properties=${props}`, headers);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { dealId, force = false } = body;
    if (!dealId) return Response.json({ error: 'dealId required' }, { status: 400 });

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const hsHeaders = {
      'Authorization': `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
    };

    const corporateId = String(dealId);
    const result: Record<string, any> = { corporateId, locations: [], signers: [] };

    // ── 1. Fetch deal ─────────────────────────────────────────────────────────
    let deal: any;
    try {
      deal = await getDealWithAssociations(corporateId, hsHeaders);
    } catch (e: any) {
      return Response.json({ error: `Failed to fetch deal ${corporateId}: ${e.message}` }, { status: 404 });
    }

    const dealProps = deal.properties || {};
    const pricingTier = dealProps.pricing_tier__ || dealProps.pricing_tier || 'STANDARD';

    // ── 2. Find the associated parent company ─────────────────────────────────
    const companyAssocs = deal.associations?.companies?.results || [];
    if (!companyAssocs.length) {
      return Response.json({ error: `Deal ${corporateId} has no associated company in HubSpot` }, { status: 400 });
    }

    // The "primary" company association is the parent entity
    const primaryCompanyId = companyAssocs[0].id;
    const parentCompany = await getCompany(primaryCompanyId, hsHeaders);
    const pc = parentCompany.properties || {};

    // ── 3. Fetch associated contacts (signers) ────────────────────────────────
    const contactAssocs = deal.associations?.contacts?.results || [];
    const contacts: any[] = [];
    for (const ca of contactAssocs.slice(0, 5)) {
      try {
        const c = await getContact(ca.id, hsHeaders);
        contacts.push(c.properties || {});
      } catch { /* skip bad contacts */ }
    }
    const primaryContact = contacts[0] || {};

    // ── 4. Upsert MerchantCorporateProfile ────────────────────────────────────
    const industryClass = mapHubspotIndustry(pc.industry || '');
    const mccCode = pc.mcc_code || industryToMcc(industryClass);
    const legalName = pc.name || dealProps.dealname || 'New Merchant';
    const signerEmail = primaryContact.email || '';

    const profileData: Record<string, any> = {
      corporateId,
      legalName,
      signerEmail,
      firstName:         primaryContact.firstname || '',
      lastName:          primaryContact.lastname  || '',
      corporatePhone:    (primaryContact.phone || pc.phone || '').replace(/\D/g, ''),
      titleType:         mapJobTitle(primaryContact.jobtitle || ''),
      industryClass,
      mccCode,
      pricingTier,
      hubspotQuoteUrl:   dealProps.hs_quote_link || '',
      applicationStatus: 'Incomplete',
    };

    // Only set fields that come from HubSpot custom properties if present
    if (pc.ein)                 profileData.taxId             = pc.ein.replace(/\D/g, '');
    if (pc.ownership_type)      profileData.ownershipType     = pc.ownership_type.toUpperCase();
    if (pc.state_of_formation)  profileData.stateOfFormation  = pc.state_of_formation.toUpperCase();
    if (pc.establishment_year)  profileData.establishmentYear = pc.establishment_year;
    if (pc.monthly_card_sales)  profileData.monthlyCardSales  = String(pc.monthly_card_sales);
    if (pc.avg_ticket)          profileData.avgSaleAmount     = String(pc.avg_ticket);
    if (pc.card_present_pct)    profileData.cardPresentPct    = parseInt(pc.card_present_pct, 10);

    const existingProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    let profileId: string;

    if (existingProfiles?.length) {
      const existing = existingProfiles[0];
      // Don't overwrite sensitive/progress fields unless force=true
      const safeUpdate: Record<string, any> = {
        legalName,
        hubspotQuoteUrl: profileData.hubspotQuoteUrl || existing.hubspotQuoteUrl,
        pricingTier:     pricingTier || existing.pricingTier,
        industryClass:   industryClass || existing.industryClass,
        mccCode:         mccCode || existing.mccCode,
      };
      if (force || !existing.taxId)            safeUpdate.taxId            = profileData.taxId;
      if (force || !existing.ownershipType)    safeUpdate.ownershipType    = profileData.ownershipType;
      if (force || !existing.signerEmail)      safeUpdate.signerEmail      = profileData.signerEmail;
      if (force || !existing.corporatePhone)   safeUpdate.corporatePhone   = profileData.corporatePhone;
      if (force || !existing.monthlyCardSales) safeUpdate.monthlyCardSales = profileData.monthlyCardSales;
      if (force || !existing.avgSaleAmount)    safeUpdate.avgSaleAmount    = profileData.avgSaleAmount;

      await base44.asServiceRole.entities.MerchantCorporateProfile.update(existing.id, safeUpdate);
      profileId = existing.id;
      result.profileAction = 'updated';
    } else {
      const created = await base44.asServiceRole.entities.MerchantCorporateProfile.create(profileData);
      profileId = created.id;
      result.profileAction = 'created';
    }

    result.profile = { legalName, industryClass, mccCode, pricingTier, taxId: profileData.taxId || null };

    // ── 5. Upsert primary signer from contact ─────────────────────────────────
    if (signerEmail) {
      const existingSigners = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId });
      const primarySigner = existingSigners?.find((s: any) => s.isPrimarySigner) || existingSigners?.[0];

      if (!primarySigner) {
        await base44.asServiceRole.entities.MerchantSigners.create({
          corporateId,
          firstName:          primaryContact.firstname || '',
          lastName:           primaryContact.lastname  || '',
          signerEmail,
          ownershipPercentage: parseInt(primaryContact.ownership_percent || '100', 10),
          isPrimarySigner:    true,
          identityStatus:     'Pending Invitation',
          titleType:          mapJobTitle(primaryContact.jobtitle || ''),
          corporatePhone:     (primaryContact.phone || '').replace(/\D/g, ''),
        });
        result.signers.push({ action: 'created', email: signerEmail });
      } else {
        result.signers.push({ action: 'exists', email: primarySigner.signerEmail });
      }
    }

    // ── 6. Fetch child companies → locations + concepts ───────────────────────
    // HubSpot: child companies are returned in the parent company's associations
    const childCompanyAssocs = parentCompany.associations?.companies?.results || [];
    console.log(`[syncFromHubspot] Found ${childCompanyAssocs.length} child company associations for parent ${primaryCompanyId}`);

    // If no child companies, create one location from the parent company's address
    const locationSources = childCompanyAssocs.length > 0
      ? childCompanyAssocs
      : [{ id: primaryCompanyId, _useParent: true }];

    for (const assoc of locationSources) {
      try {
        const locCompany = assoc._useParent ? parentCompany : await getCompany(assoc.id, hsHeaders);
        const lc = locCompany.properties || {};

        // Skip if this is the parent company itself (when it appears in its own associations)
        if (!assoc._useParent && assoc.id === primaryCompanyId) continue;

        const dbaName    = lc.dba_name || lc.name || legalName;
        const street     = lc.address || '';
        const city       = lc.city    || '';
        const state      = lc.state   || '';
        const zip        = lc.zip     || '';
        const locMcc     = lc.mcc_code || mccCode;
        const locPricing = lc.pricing_tier || pricingTier;
        const monthlyVol = lc.monthly_card_sales || profileData.monthlyCardSales || '5000';
        const avgTicket  = lc.avg_ticket          || profileData.avgSaleAmount    || '100';
        const cpPct      = parseInt(lc.card_present_pct || '100', 10);

        // Upsert MerchantLocations
        const existingLocs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId, dbaName });
        let locationId: string;

        if (existingLocs?.length) {
          await base44.asServiceRole.entities.MerchantLocations.update(existingLocs[0].id, {
            businessStreet:  street || existingLocs[0].businessStreet,
            businessCity:    city   || existingLocs[0].businessCity,
            businessState:   state  || existingLocs[0].businessState,
            businessZip:     zip    || existingLocs[0].businessZip,
            businessAddress: [street, city, state, zip].filter(Boolean).join(', ') || existingLocs[0].businessAddress,
          });
          locationId = existingLocs[0].id;
          result.locations.push({ dbaName, action: 'updated', locationId });
        } else {
          const newLoc = await base44.asServiceRole.entities.MerchantLocations.create({
            corporateId,
            dbaName,
            businessStreet:  street,
            businessCity:    city,
            businessState:   state,
            businessZip:     zip,
            businessAddress: [street, city, state, zip].filter(Boolean).join(', '),
            applicationStepStatus: 'In Review',
          });
          locationId = newLoc.id;
          result.locations.push({ dbaName, action: 'created', locationId });
        }

        // Upsert MerchantProcessingConcept (one MID per location)
        const existingConcepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({
          corporateId, locationId,
        });

        if (!existingConcepts?.length) {
          await base44.asServiceRole.entities.MerchantProcessingConcept.create({
            corporateId,
            locationId,
            dbaName,
            mccCode:          locMcc,
            pricingTier:      locPricing,
            monthlyCardSales: monthlyVol,
            avgSaleAmount:    avgTicket,
            cardPresentPct:   cpPct,
            applicationStepStatus: 'In Review',
          });
          result.locations[result.locations.length - 1].conceptAction = 'created';
        } else {
          result.locations[result.locations.length - 1].conceptAction = 'exists';
        }

      } catch (locErr: any) {
        console.error(`[syncFromHubspot] Error processing location ${assoc.id}:`, locErr.message);
        result.locations.push({ id: assoc.id, action: 'error', error: locErr.message });
      }
    }

    result.success = true;
    result.portalUrl = `${Deno.env.get('PORTAL_BASE_URL') || 'https://cliqbux-onboard-prime.base44.app'}?dealId=${corporateId}`;
    result.summary = `${result.profileAction} profile, ${result.locations.filter((l: any) => l.action !== 'error').length} location(s) synced`;

    // ── 7. Write portal URL back to HubSpot deal ──────────────────────────────
    try {
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${corporateId}`, {
        method: 'PATCH',
        headers: hsHeaders,
        body: JSON.stringify({ properties: { portal_url: result.portalUrl } }),
      });
      result.portalUrlWrittenBack = true;
    } catch (e: any) {
      console.warn(`[syncFromHubspot] Could not write portal_url back to deal: ${e.message}`);
      result.portalUrlWrittenBack = false;
    }

    console.log(`[syncFromHubspot] deal=${corporateId}: ${result.summary}`);
    return Response.json(result);

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
