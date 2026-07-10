import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-10b — signer sync rewrite (multi-contact, contactSource/contactsFound/contactErrors diagnostics) + cardPresentPct string fix
// redeployed 2026-07-10 — OWNERSHIP_HS_TO_B44 mapping (fixes sync 500 during Stage Editor pull; GitHub sync alone did not deploy)
// redeployed 2026-07-09 — portal auth gate + processing_pricing_tier + customAuthPerCard sync

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


// Maps the merchant's chosen pricingTier to the correct MSPWare pricing_method.
// MerchantMID.pricingMethod has a schema-level default of 'ICPLS', which will
// silently mask this derivation if the field is left unset at create time —
// always set it explicitly here rather than relying on the schema default.
// 2026-07-06: added the 3 canonical simplified tier names (see AGENTS.md Critical
// Lesson #12). Legacy values kept mapped for historical/in-flight records.
const TIER_TO_METHOD: Record<string, string> = {
  'CUSTOM_FLAT_RATE': 'FLAT',
  'CUSTOM_INTERCHANGE_PLUS': 'ICPLS',
  'SELF_SERVE_CASH_DISCOUNT': 'TIERD',
  'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS',
  'SELF_SWIPED': 'ICPLS', 'SELF_KEYED': 'ICPLS', // ON HOLD — see Critical Lesson #12
  // 2026-07-03: Teddy confirmed Cliqbux never uses MSPWare's "Clear and Simple"
  // pricing method — every Cash Discount plan uses "Tiered" (wire value TIERD)
  // instead, with a flat-rate fee schedule sent explicitly in buildFormPayload
  // (see submitToMSP/signApplication + docs/mspware-field-reference.md).
  'CASH_DISCOUNT': 'TIERD', 'SELF_CASH_DISCOUNT': 'TIERD',
};

// ─── syncFromHubspot ──────────────────────────────────────────────────────────
// Pulls a merchant's full HubSpot hierarchy into the onboarding portal entities.
//
// HubSpot data model → Base44 entity mapping:
//   Deal                     → identifies the merchant (corporateId = dealId)
//   Parent Company           → MerchantCorporateProfile (legal entity, EIN, ownership)
//   Child Companies          → MerchantLocations (one per physical location)
//   Child Company (1:1)      → MerchantMID (one MID per location)
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
    'pricing_tier',         // CUSTOM_FLAT_RATE, CUSTOM_INTERCHANGE_PLUS, SELF_SERVE_CASH_DISCOUNT (legacy: TRADITIONAL, STANDARD, PREMIUM, CASH_DISCOUNT)
    'pricing_method',       // ICPLS, CLEAR, FLAT
  ],
  contact: [
    'firstname', 'lastname', 'email', 'phone', 'jobtitle',
    'ownership_percent',    // Custom: beneficial ownership %
  ],
  deal: [
    'dealname', 'amount', 'dealstage', 'pipeline',
    'pricing_tier__',            // legacy — property was never actually created in HubSpot (confirmed 2026-07-09)
    'processing_pricing_tier',   // the REAL deal-level tier property (created 2026-07-09)
    'custom_markup_percentage',  // negotiated markup % — required for custom tiers
    'custom_per_tx_fee',         // negotiated per-transaction fee ($) — required for custom tiers
    'custom_auth_per_card',      // negotiated per-auth fee ($) — required for custom tiers
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
    const body = await req.json();
    const { dealId, force = false } = body;
    if (!dealId) return Response.json({ error: 'dealId required' }, { status: 400 });

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(dealId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    // Tier precedence: processing_pricing_tier (the real deal property, 2026-07-09)
    // → legacy names → STANDARD. Normalize legacy/lowercase option values to the
    // canonical enum so TIER_TO_METHOD and the custom-pricing guard match.
    const TIER_ALIASES: Record<string, string> = {
      'CUSTOM': 'CUSTOM_INTERCHANGE_PLUS',              // pre-cleanup processing_pricing_tier option
      'ZERO_CASH_DISCOUNT': 'SELF_SERVE_CASH_DISCOUNT', // pre-cleanup processing_pricing_tier option
      'CASH_DISCOUNT': 'SELF_SERVE_CASH_DISCOUNT',
      'SELF_CASH_DISCOUNT': 'SELF_SERVE_CASH_DISCOUNT',
      // 'STANDARD_PROCESSING_249_010_289_030' deliberately NOT mapped — that is the
      // on-hold self-serve flat rate (Elavon unsupported); leaving it unmapped makes
      // downstream fall back to safe defaults instead of boarding an unsupported plan.
    };
    const rawTier = String(dealProps.processing_pricing_tier || dealProps.pricing_tier__ || dealProps.pricing_tier || 'STANDARD').toUpperCase();
    const pricingTier = TIER_ALIASES[rawTier] || rawTier;

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
    // Falls back to the primary company's contacts when the deal itself has no
    // contact associations. Fetch failures are REPORTED in the result, never
    // silently swallowed (a swallowed failure here is why signers appeared to
    // "not populate" on 2026-07-09).
    let contactAssocs = deal.associations?.contacts?.results || [];
    result.contactSource = contactAssocs.length ? 'deal' : 'none';
    if (!contactAssocs.length) {
      try {
        const compWithContacts = await hsGet(
          `/crm/v3/objects/companies/${primaryCompanyId}?associations=contacts`, hsHeaders
        );
        contactAssocs = compWithContacts.associations?.contacts?.results || [];
        if (contactAssocs.length) result.contactSource = 'company';
      } catch (e: any) {
        (result.contactErrors = result.contactErrors || []).push(`company contact lookup failed: ${e.message}`);
      }
    }
    // De-dupe association entries (HubSpot returns one row per association label)
    const seenContactIds = new Set<string>();
    const contacts: any[] = [];
    for (const ca of contactAssocs) {
      if (seenContactIds.has(String(ca.id))) continue;
      seenContactIds.add(String(ca.id));
      if (contacts.length >= 5) break;
      try {
        const c = await getContact(ca.id, hsHeaders);
        contacts.push(c.properties || {});
      } catch (e: any) {
        (result.contactErrors = result.contactErrors || []).push(`contact ${ca.id}: ${e.message}`);
      }
    }
    result.contactsFound = contacts.length;
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
    // HubSpot ownership_type option values do not match the Base44 enum
    // (HubSpot: LLC / SOLE_PROP / PARTNERSHIP / GOVERNMENT / OTHER; Base44:
    // LIMITED_COMPANY / SOLE_PROPRIETOR / GENERAL_PARTNERSHIP / ...). Map here;
    // unknown values are DROPPED rather than crashing profile create with an
    // enum violation (root cause of the 2026-07-09 sync 500).
    const OWNERSHIP_HS_TO_B44: Record<string, string> = {
      'LLC': 'LIMITED_COMPANY', 'LIMITED_COMPANY': 'LIMITED_COMPANY',
      'SOLE_PROP': 'SOLE_PROPRIETOR', 'SOLE_PROPRIETOR': 'SOLE_PROPRIETOR',
      'CORPORATION': 'CORPORATION',
      'PARTNERSHIP': 'GENERAL_PARTNERSHIP', 'GENERAL_PARTNERSHIP': 'GENERAL_PARTNERSHIP',
      'LIMITED_PARTNERSHIP': 'LIMITED_PARTNERSHIP',
      'NON_PROFIT': 'NON_PROFIT', 'SUB_S_CORP': 'SUB_S_CORP', 'TRUST': 'TRUST',
      // GOVERNMENT / OTHER intentionally unmapped — no confirmed MSPWare wire codes
    };
    if (pc.ownership_type) {
      const mappedOwnership = OWNERSHIP_HS_TO_B44[String(pc.ownership_type).toUpperCase()];
      if (mappedOwnership) profileData.ownershipType = mappedOwnership;
    }
    if (pc.state_of_formation)  profileData.stateOfFormation  = pc.state_of_formation.toUpperCase();
    if (pc.establishment_year)  profileData.establishmentYear = pc.establishment_year;
    if (pc.monthly_card_sales)  profileData.monthlyCardSales  = String(pc.monthly_card_sales);
    if (pc.avg_ticket)          profileData.avgSaleAmount     = String(pc.avg_ticket);
    if (pc.card_present_pct)    profileData.cardPresentPct    = String(pc.card_present_pct);

    // Deal-level negotiated pricing (custom tiers). Cash Discount deals leave these
    // blank on purpose — the fixed CD schedule (3.3816% / $0.00 / $0.00) is hardcoded
    // in buildFormPayload (submitToMSP/signApplication), single source of truth.
    const numOrNull = (v: any) => (v == null || v === '' ? null : parseFloat(v));
    if (numOrNull(dealProps.custom_markup_percentage) != null) profileData.customMarkupPercentage = numOrNull(dealProps.custom_markup_percentage);
    if (numOrNull(dealProps.custom_per_tx_fee)        != null) profileData.customPerTxFee         = numOrNull(dealProps.custom_per_tx_fee);
    if (numOrNull(dealProps.custom_auth_per_card)     != null) profileData.customAuthPerCard      = numOrNull(dealProps.custom_auth_per_card);

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
      // Negotiated pricing: fill blanks always; overwrite only with force
      if (profileData.customMarkupPercentage != null && (force || existing.customMarkupPercentage == null)) safeUpdate.customMarkupPercentage = profileData.customMarkupPercentage;
      if (profileData.customPerTxFee         != null && (force || existing.customPerTxFee         == null)) safeUpdate.customPerTxFee         = profileData.customPerTxFee;
      if (profileData.customAuthPerCard      != null && (force || existing.customAuthPerCard      == null)) safeUpdate.customAuthPerCard      = profileData.customAuthPerCard;

      await base44.asServiceRole.entities.MerchantCorporateProfile.update(existing.id, safeUpdate);
      profileId = existing.id;
      result.profileAction = 'updated';
    } else {
      const created = await base44.asServiceRole.entities.MerchantCorporateProfile.create(profileData);
      profileId = created.id;
      result.profileAction = 'created';
    }

    result.profile = { legalName, industryClass, mccCode, pricingTier, taxId: profileData.taxId || null };

    // ── 5. Upsert signers from ALL associated contacts (multi-signer support) ──
    // Every deal/company contact with an email becomes a MerchantSigners record,
    // de-duped by email. The first contact becomes primary unless a primary
    // already exists.
    {
      const existingSigners = await base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }) || [];
      let hasPrimary = existingSigners.some((s: any) => s.isPrimarySigner);
      for (const contact of contacts) {
        const email = (contact.email || '').trim().toLowerCase();
        if (!email) { result.signers.push({ action: 'skipped_no_email' }); continue; }
        const already = existingSigners.find((s: any) => (s.signerEmail || '').trim().toLowerCase() === email);
        if (already) { result.signers.push({ action: 'exists', email }); continue; }
        await base44.asServiceRole.entities.MerchantSigners.create({
          corporateId,
          firstName:          contact.firstname || '',
          lastName:           contact.lastname  || '',
          signerEmail:        email,
          ownershipPercentage: parseInt(contact.ownership_percent || (hasPrimary ? '0' : '100'), 10),
          isPrimarySigner:    !hasPrimary,
          identityStatus:     'Pending Invitation',
          titleType:          mapJobTitle(contact.jobtitle || ''),
          corporatePhone:     (contact.phone || '').replace(/\D/g, ''),
        });
        if (!hasPrimary) hasPrimary = true;
        result.signers.push({ action: 'created', email });
      }
    }

    // ── 6. Fetch child companies → locations + merchantMIDs ───────────────────────
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

        // Upsert MerchantMID (one MID per location)
        const existingMerchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({
          corporateId, locationId,
        });

        if (!existingMerchantMIDs?.length) {
          // Note: MerchantMID has no `pricingTier` field — that was a bug (silently
          // dropped by the schema). Derive the real `pricingMethod` field instead,
          // since MerchantMID.pricingMethod's schema default ('ICPLS') would
          // otherwise mask a Cash Discount merchant's actual pricing method.
          const pricingMethod = TIER_TO_METHOD[(locPricing || '').toUpperCase()] || 'ICPLS';
          await base44.asServiceRole.entities.MerchantMID.create({
            corporateId,
            locationId,
            dbaName,
            mccCode:          locMcc,
            pricingMethod,
            monthlyCardSales: monthlyVol,
            avgSaleAmount:    avgTicket,
            cardPresentPct:   cpPct,
            applicationStepStatus: 'In Review',
          });
          result.locations[result.locations.length - 1].midAction = 'created';
        } else {
          result.locations[result.locations.length - 1].midAction = 'exists';
        }

      } catch (locErr: any) {
        console.error(`[syncFromHubspot] Error processing location ${assoc.id}:`, locErr.message);
        result.locations.push({ id: assoc.id, action: 'error', error: locErr.message });
      }
    }

    result.success = true;
    result.portalUrl = `${Deno.env.get('PORTAL_BASE_URL') || 'https://cliqbux-onboard-prime.base44.app'}?dealId=${corporateId}`;
    result.summary = `${result.profileAction} profile, ${result.locations.filter((l: any) => l.action !== 'error').length} location(s) synced`;

    // ── 7. Write portal URL back to HubSpot deal + advance stage ─────────────
    try {
      await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${corporateId}`, {
        method: 'PATCH',
        headers: hsHeaders,
        body: JSON.stringify({
          properties: {
            portal_url: result.portalUrl,
            dealstage:  'onboarding_link_sent',
          },
        }),
      });
      result.portalUrlWrittenBack = true;
      result.hubspotStage = 'onboarding_link_sent';
    } catch (e: any) {
      console.warn(`[syncFromHubspot] Could not write portal_url/stage back to deal: ${e.message}`);
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