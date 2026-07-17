import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-10i — location address updates are FILL-BLANKS-ONLY (merchant-owned once present, stops HubSpot reverting merchant edits on every portal load)
// redeployed 2026-07-10f — keep hubspotQuoteUrl in profile diagnostic; revert raw deal-key dump
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
    'custom_pertransaction_fee',  // LEGACY duplicate labeled "Custom Per-Auth Fee ($)" — some deal cards are bound to it; accepted as fallback
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
  // 2026-07-13: Do NOT map generic retail/ecommerce to 5999 — that MCC is a
  // restricted category (rejected in CA/CO/NY). Prefer blank so the merchant
  // (or sales) picks a specific MCC in the portal rather than inventing one.
  const map: Record<string, string> = {
    'RESTAURANT': '5812', 'GROCERY': '5411', 'HOTEL': '7011',
    'SALON': '7230', 'GYM': '7941', 'HEALTH': '8099',
    'AUTO': '5511', 'CLOTHING': '5691', 'ELECTRONICS': '5732',
    'FURNITURE': '5712', 'ECOMMERCE': '', 'RETAIL': '',
    'BAR': '5813', 'SERVICES': '7299',
  };
  return map[industryClass] || '';
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
    `/crm/v3/objects/deals/${dealId}?properties=${props}&associations=companies,contacts,quotes`,
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

    const corporateId = String(dealId);

    // Local Quick Stage merchants use slug corporateIds (e.g. danonos-donuts) —
    // there is no HubSpot deal. Bypass all HubSpot API calls.
    if (!/^\d+$/.test(corporateId.trim())) {
      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter(
        { corporateId }, '-created_date', 1
      );
      return Response.json({
        success: true,
        synced: false,
        hubspotBypass: true,
        corporateId,
        locations: [],
        signers: [],
        summary: profiles?.length
          ? 'Local merchant (no HubSpot deal) — sync skipped'
          : 'Local corporateId has no HubSpot deal and no Base44 profile yet',
        profile: profiles?.[0] || null,
      });
    }

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const hsHeaders = {
      'Authorization': `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
    };

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
    // → legacy names. NEVER default blank HubSpot tiers to STANDARD — that clobbered
    // agent-saved Cash Discount / custom tiers (Porky's live incident 2026-07-14).
    const TIER_ALIASES: Record<string, string> = {
      'CUSTOM': 'CUSTOM_INTERCHANGE_PLUS',              // pre-cleanup processing_pricing_tier option
      'ZERO_CASH_DISCOUNT': 'SELF_SERVE_CASH_DISCOUNT', // pre-cleanup processing_pricing_tier option
      'CASH_DISCOUNT': 'SELF_SERVE_CASH_DISCOUNT',
      'SELF_CASH_DISCOUNT': 'SELF_SERVE_CASH_DISCOUNT',
      // 'STANDARD_PROCESSING_249_010_289_030' deliberately NOT mapped — that is the
      // on-hold self-serve flat rate (Elavon unsupported); leaving it unmapped makes
      // downstream fall back to safe defaults instead of boarding an unsupported plan.
    };
    const CANONICAL_TIERS = new Set([
      'CUSTOM_FLAT_RATE', 'CUSTOM_INTERCHANGE_PLUS', 'SELF_SERVE_CASH_DISCOUNT',
    ]);
    const rawFromDeal = String(
      dealProps.processing_pricing_tier || dealProps.pricing_tier__ || dealProps.pricing_tier || ''
    ).trim().toUpperCase();
    const dealPricingTier = rawFromDeal
      ? (TIER_ALIASES[rawFromDeal] || rawFromDeal)
      : '';

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

    // ── 3b. Resolve the signing link from the deal's QUOTES ──────────────────
    // hs_quote_link lives on the QUOTE object, NOT the deal — confirmed via API
    // 2026-07-10: the deal-level property of the same name is always empty, so
    // milestone 1 never unlocked. Newest quote with a live link wins. Also
    // captures the esign status so a sync after signing upgrades the profile
    // to 'Quote Signed' even if the HubSpot quote_signed workflow is missing.
    // 2026-07-13: keep quote id (for MerchantLocations.hubspotQuoteId) and
    // payment props (HubSpot Payments — hs_payment_status is read-only).
    let quoteUrl = dealProps.hs_quote_link || '';
    let quoteEsignStatus = '';
    let resolvedQuoteId = '';
    let quotePaymentStatus = '';
    const quoteAssocs = deal.associations?.quotes?.results || [];
    const seenQuoteIds = new Set<string>();
    const dealQuotes: any[] = [];
    for (const qa of quoteAssocs) {
      if (seenQuoteIds.has(String(qa.id))) continue;
      seenQuoteIds.add(String(qa.id));
      if (dealQuotes.length >= 5) break;
      try {
        const q = await hsGet(`/crm/v3/objects/quotes/${qa.id}?properties=hs_quote_link,hs_status,hs_quote_esign_status,hs_expiration_date,hs_createdate,hs_payment_status,hs_payment_date,hs_payment_enabled,hs_quote_amount`, hsHeaders);
        // Keep id — properties alone drop it and hubspotQuoteId cannot be persisted
        dealQuotes.push({ id: String(qa.id), ...(q.properties || {}) });
      } catch (e: any) {
        // A 403 here means the HubSpot private app lacks crm.objects.quotes.read
        (result.quoteErrors = result.quoteErrors || []).push(`quote ${qa.id}: ${e.message}`);
      }
    }
    const linkedQuotes = dealQuotes
      .filter((q: any) => q.hs_quote_link)
      .sort((a: any, b: any) => String(b.hs_createdate || '').localeCompare(String(a.hs_createdate || '')));
    if (linkedQuotes.length) {
      quoteUrl = linkedQuotes[0].hs_quote_link;
      quoteEsignStatus = linkedQuotes[0].hs_quote_esign_status || '';
      resolvedQuoteId = String(linkedQuotes[0].id || '');
      quotePaymentStatus = linkedQuotes[0].hs_payment_status || '';
    }
    result.quoteUrl = quoteUrl || null;
    result.quoteEsignStatus = quoteEsignStatus || null;
    result.quoteId = resolvedQuoteId || null;
    result.quotePaymentStatus = quotePaymentStatus || null;

    // ── 4. Upsert MerchantCorporateProfile ────────────────────────────────────
    const industryClass = mapHubspotIndustry(pc.industry || '');
    const mccCode = pc.mcc_code || industryToMcc(industryClass);
    const legalName = pc.name || dealProps.dealname || 'New Merchant';
    const signerEmail = primaryContact.email || '';

    // Resolve tier: never invent STANDARD when HubSpot is blank; never clobber an
    // agent-saved canonical tier (Cash Discount / custom) with HubSpot legacy/blank.
    const resolvePricingTier = (existingTier: string | undefined | null): string | undefined => {
      const existing = existingTier != null && existingTier !== '' ? String(existingTier) : undefined;
      const existingUpper = String(existing || '').toUpperCase();
      // force=true only wins when HubSpot has a *canonical* tier — never force-write
      // legacy STANDARD over an agent-saved Cash Discount / custom tier.
      if (force && dealPricingTier && CANONICAL_TIERS.has(dealPricingTier)) {
        return dealPricingTier;
      }
      if (CANONICAL_TIERS.has(existingUpper)) {
        if (dealPricingTier && CANONICAL_TIERS.has(dealPricingTier)) return dealPricingTier;
        return existing;
      }
      if (dealPricingTier && CANONICAL_TIERS.has(dealPricingTier)) return dealPricingTier;
      if (existing) return existing;
      // Blank HubSpot + no existing → leave unset (agent sets via Applications → Pricing)
      // Do not invent STANDARD. Non-canonical deal values (STANDARD etc.) only apply
      // when there is no existing tier yet (create path).
      return (dealPricingTier && !['STANDARD', 'TRADITIONAL', 'PREMIUM', 'CUSTOM'].includes(dealPricingTier))
        ? dealPricingTier
        : undefined;
    };

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
      hubspotQuoteUrl:   quoteUrl,
      applicationStatus: quoteEsignStatus === 'SIGNED' ? 'Quote Signed' : 'Incomplete',
    };
    const createTier = resolvePricingTier(null);
    if (createTier) profileData.pricingTier = createTier;

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
    // Per-auth fee: canonical property wins, but fall back to the legacy duplicate
    // "custom_pertransaction_fee" (labeled "Custom Per-Auth Fee ($)" in HubSpot) —
    // 2026-07-10: the property cleanup didn't delete it, some deal cards are bound
    // to it, and reps filled it instead of custom_auth_per_card. Reading only the
    // canonical name left customAuthPerCard null and blocked the first ICPLS signing.
    const authPerCardVal = numOrNull(dealProps.custom_auth_per_card) != null
      ? numOrNull(dealProps.custom_auth_per_card)
      : numOrNull(dealProps.custom_pertransaction_fee);
    if (authPerCardVal != null) profileData.customAuthPerCard = authPerCardVal;

    const existingProfiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
    let profileId: string;
    let effectivePricingTier: string | undefined = createTier || dealPricingTier || undefined;

    if (existingProfiles?.length) {
      const existing = existingProfiles[0];
      const lockStatus = String(existing.portalLockStatus || '').toLowerCase();
      const pricingLocked = ['signing', 'pending_signature', 'all_signed'].includes(lockStatus);
      if (pricingLocked) {
        console.log(
          `[syncFromHubspot] Pricing mutation skipped — portalLockStatus=${lockStatus} ` +
          `(will not write pricingTier / customMarkupPercentage / customPerTxFee / customAuthPerCard)`
        );
      }
      // Don't overwrite sensitive/progress fields unless force=true
      const resolvedTier = pricingLocked ? null : resolvePricingTier(existing.pricingTier);
      effectivePricingTier = resolvedTier || existing.pricingTier || undefined;
      const safeUpdate: Record<string, any> = {
        legalName,
        hubspotQuoteUrl: profileData.hubspotQuoteUrl || existing.hubspotQuoteUrl,
        // Signature detection — only ever upgrades Incomplete/Pricing Selected, never regresses
        ...(quoteEsignStatus === 'SIGNED' &&
          (!existing.applicationStatus ||
            existing.applicationStatus === 'Incomplete' ||
            existing.applicationStatus === 'Pricing Selected')
          ? { applicationStatus: 'Quote Signed' } : {}),
        industryClass:   industryClass || existing.industryClass,
        mccCode:         mccCode || existing.mccCode,
      };
      if (!pricingLocked && resolvedTier) safeUpdate.pricingTier = resolvedTier;
      // Pull architecture (no HubSpot workflow webhooks): stamp quote lifecycle from live quote props
      if (quoteEsignStatus === 'SIGNED' && !existing.quoteSignedAt) {
        safeUpdate.quoteSignedAt = new Date().toISOString();
        if (!existing.equipmentPaidAt) safeUpdate.equipmentShippingStatus = 'hold';
      }
      // HubSpot Payments: stamp equipmentPaidAt once when quote is PAID (never clears)
      if (quotePaymentStatus === 'PAID' && !existing.equipmentPaidAt) {
        const paidAt = new Date().toISOString();
        safeUpdate.equipmentPaidAt = paidAt;
        safeUpdate.equipmentShippingStatus = 'ready_to_ship';
        if (!existing.quoteSignedAt) safeUpdate.quoteSignedAt = paidAt;
      }
      if (force || !existing.taxId)            safeUpdate.taxId            = profileData.taxId;
      if (force || !existing.ownershipType)    safeUpdate.ownershipType    = profileData.ownershipType;
      if (force || !existing.signerEmail)      safeUpdate.signerEmail      = profileData.signerEmail;
      if (force || !existing.corporatePhone)   safeUpdate.corporatePhone   = profileData.corporatePhone;
      if (force || !existing.monthlyCardSales) safeUpdate.monthlyCardSales = profileData.monthlyCardSales;
      if (force || !existing.avgSaleAmount)    safeUpdate.avgSaleAmount    = profileData.avgSaleAmount;
      // Negotiated pricing is SALES-owned — set on the HubSpot deal, never edited
      // by the merchant — so always mirror non-null deal values. The old
      // fill-blanks-only rule meant a rep correcting a rate in HubSpot never
      // propagated to the profile. Never nulls an existing value.
      if (!pricingLocked) {
        if (profileData.customMarkupPercentage != null) safeUpdate.customMarkupPercentage = profileData.customMarkupPercentage;
        if (profileData.customPerTxFee         != null) safeUpdate.customPerTxFee         = profileData.customPerTxFee;
        if (profileData.customAuthPerCard      != null) safeUpdate.customAuthPerCard      = profileData.customAuthPerCard;
      }

      await base44.asServiceRole.entities.MerchantCorporateProfile.update(existing.id, safeUpdate);
      profileId = existing.id;
      result.profileAction = 'updated';
    } else {
      if (quotePaymentStatus === 'PAID') {
        const paidAt = new Date().toISOString();
        profileData.equipmentPaidAt = paidAt;
        profileData.equipmentShippingStatus = 'ready_to_ship';
        profileData.quoteSignedAt = paidAt;
      } else if (quoteEsignStatus === 'SIGNED') {
        profileData.quoteSignedAt = new Date().toISOString();
        profileData.equipmentShippingStatus = 'hold';
      }
      const created = await base44.asServiceRole.entities.MerchantCorporateProfile.create(profileData);
      profileId = created.id;
      result.profileAction = 'created';
    }

    result.profile = {
      legalName,
      industryClass,
      mccCode,
      pricingTier: effectivePricingTier || null,
      taxId: profileData.taxId || null,
      hubspotQuoteUrl: profileData.hubspotQuoteUrl || '',
    };
    // ── 4b. Seed the first legal entity from HubSpot company data ─────────────
    // The sync previously left legalEntities[] empty, so the merchant entity
    // panel showed blank fields even when HubSpot already knew the EIN and
    // ownership type (2026-07-10). Only seeds when NO entity exists — never
    // touches merchant-entered entities.
    let seededEntityId = null;
    {
      const profRec = await base44.asServiceRole.entities.MerchantCorporateProfile.get(profileId);
      let entsRaw = profRec?.legalEntities ?? [];
      if (typeof entsRaw === 'string') { try { entsRaw = JSON.parse(entsRaw); } catch { entsRaw = []; } }
      const ents = Array.isArray(entsRaw) ? entsRaw : [];
      if (ents.length === 0) {
        seededEntityId = crypto.randomUUID();
        const entity: Record<string, any> = {
          entityId: seededEntityId,
          legalBusinessName: legalName,
        };
        if (profileData.taxId)             entity.federalEIN        = profileData.taxId;
        if (profileData.ownershipType)     entity.ownershipType     = profileData.ownershipType;
        if (profileData.establishmentYear) entity.establishmentYear = String(profileData.establishmentYear);
        if (pc.address) entity.mailingStreet = pc.address;
        if (pc.city)    entity.mailingCity   = pc.city;
        if (pc.state)   entity.mailingState  = pc.state;
        if (pc.zip)     entity.mailingZip    = pc.zip;
        await base44.asServiceRole.entities.MerchantCorporateProfile.update(profileId, { legalEntities: [entity] });
        result.entityAction = 'seeded';
      } else {
        seededEntityId = ents[0]?.entityId || null;
        result.entityAction = 'exists';
      }
    }

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
        const locPricing = lc.pricing_tier || effectivePricingTier;
        const monthlyVol = lc.monthly_card_sales || profileData.monthlyCardSales || '5000';
        const avgTicket  = lc.avg_ticket          || profileData.avgSaleAmount    || '100';
        const cpPct      = parseInt(lc.card_present_pct || '100', 10);

        // Upsert MerchantLocations
        const existingLocs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId, dbaName });
        let locationId: string;

        if (existingLocs?.length) {
          await base44.asServiceRole.entities.MerchantLocations.update(existingLocs[0].id, {
            // FILL-BLANKS ONLY: the address is MERCHANT-owned once it exists —
            // HubSpot values are only a prefill seed. The old precedence
            // (HubSpot first) silently reverted merchant corrections on every
            // portal load, since the portal re-syncs while the quote is
            // unsigned (observed live 2026-07-10: an edited street address
            // reverted to the stale HubSpot company address).
            businessStreet:  existingLocs[0].businessStreet || street,
            businessCity:    existingLocs[0].businessCity   || city,
            businessState:   existingLocs[0].businessState  || state,
            businessZip:     existingLocs[0].businessZip    || zip,
            businessAddress: existingLocs[0].businessAddress || [street, city, state, zip].filter(Boolean).join(', '),
            ...(resolvedQuoteId ? { hubspotQuoteId: resolvedQuoteId } : {}),
          });
          locationId = existingLocs[0].id;
          result.locations.push({ dbaName, action: 'updated', locationId });
        } else {
          const newLoc = await base44.asServiceRole.entities.MerchantLocations.create({
            corporateId,
            entityId: seededEntityId || undefined,
            dbaName,
            businessStreet:  street,
            businessCity:    city,
            businessState:   state,
            businessZip:     zip,
            businessAddress: [street, city, state, zip].filter(Boolean).join(', '),
            applicationStepStatus: 'In Review',
            ...(resolvedQuoteId ? { hubspotQuoteId: resolvedQuoteId } : {}),
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
            // Derive industry_type from the MCC (same rule as the portal UI) so
            // prefilled MIDs don't sit with a blank required field. MS/ARU are
            // never derived — MS was rejected live by MSPWare 2026-07-10.
            industryType:     ['5811', '5812', '5813', '5814'].includes(String(locMcc).replace(/[A-Z]+$/i, '')) ? 'RS'
                              : String(locMcc) === '5411' ? 'SP'
                              : String(locMcc) === '7011' ? 'HT' : 'RE',
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

    // Backfill hubspotQuoteId on any location for this deal that the loop missed
    // (e.g. merchant-added locations not mirrored as HubSpot child companies).
    if (resolvedQuoteId) {
      try {
        const allLocs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }) || [];
        let backfilled = 0;
        for (const loc of allLocs) {
          if (String(loc.hubspotQuoteId || '') === resolvedQuoteId) continue;
          await base44.asServiceRole.entities.MerchantLocations.update(loc.id, { hubspotQuoteId: resolvedQuoteId });
          backfilled++;
        }
        if (backfilled) result.quoteIdBackfilled = backfilled;
      } catch (e: any) {
        console.warn(`[syncFromHubspot] hubspotQuoteId backfill failed: ${e.message}`);
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