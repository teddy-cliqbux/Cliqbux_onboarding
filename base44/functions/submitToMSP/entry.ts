import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-10j — cnp_percent residual fix (see signApplication marker)
// redeployed 2026-07-10i — card-split fields (internetPct/motoPct) sourced from MerchantMID, parseInt(cardPresentPct) no longer forces 0→100, early custom-pricing guard before any MSPWare draft is created

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


// ─── MSPWare / PulsePoint Constants ───────────────────────────────────────────
// Application type 24 = "Elavon US Application" in this account
const MSP_APP_TYPE = 24;

// Cliqbux's 4-template pricing model (confirmed with Teddy 2026-07-06, see AGENTS.md
// Critical Lesson #12). Override per-merchant via profile.mspTemplateNo if needed.
// Template 6   = "Cliqbux Template Swipe Keyed"     — Custom Interchange Plus
// Template 133 = "Cash Discount Template"           — Self-Serve Cash Discount
// Custom Flat Rate template — created 2026-07-06, see docs/mspware-field-reference.md
//
// 2026-07-07: CD_TEMPLATE_NO switched from 154 to 133. #154 ("Cliqbux Template Cash
// Discount") was missing key data and is no longer used for anything. #133 ("Cash
// Discount Template") is the new standard — it is a properly MSPWare-typed Template
// record (unlike #154, which was a plain "New"-status application being reused as a
// template source) and its field values have been confirmed by Teddy. See AGENTS.md.
// 2026-07-09: ICPLS template switched from #6 ('Cliqbux Template Swipe Keyed') to
// #209 ('Custom InterchangePlus Template') — built and confirmed by Teddy. Verified
// via debugMSPFormRaw pull of #209: pricing_method ICPLS, auth_pricing_program 49999,
// entity_number 48603-17, all_cards true (incl UnionPay), tokenization none, markup
// fields correctly blank (per-merchant, sent by buildFormPayload for custom tiers).
const DEFAULT_TEMPLATE_NO = 209;      // Custom Interchange Plus
// 2026-07-07: default CD #133. Override via MSP_CD_TEMPLATE_NO if clone fails (Porky's 2026-07-14).
const CD_TEMPLATE_NO_DEFAULT = 133;
const FLAT_TEMPLATE_NO = 0;           // TODO: Custom Flat Rate — fill in once created (this session, see task tracker)
// Self-Serve Flat Rate has NO template — on hold, Elavon doesn't support it yet.
// Do not create one or route real merchants through it. See Critical Lesson #12.

function resolveCdTemplateNo(): number {
  const raw = Deno.env.get('MSP_CD_TEMPLATE_NO');
  const n = raw != null && raw !== '' ? parseInt(String(raw), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : CD_TEMPLATE_NO_DEFAULT;
}

function resolveDefaultTemplateNo(): number {
  const raw = Deno.env.get('MSP_DEFAULT_TEMPLATE_NO');
  const n = raw != null && raw !== '' ? parseInt(String(raw), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TEMPLATE_NO;
}

function sanitizeDbaForMspCreate(dba: string): string {
  const cleaned = String(dba || 'Merchant')
    .replace(/[''`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\w\s.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return cleaned || 'Merchant';
}

/** full_dba_name: no special chars (apostrophe/& rejected live 2026-07-14). */
function sanitizeFullDbaName(name: string): string {
  return String(name || '')
    .replace(/['"`]/g, '')
    .replace(/\u2018|\u2019|\u00B4/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9\s.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** legal_dba_name: letters, spaces, & and - only. */
function sanitizeLegalDbaName(name: string): string {
  return String(name || '')
    .replace(/['"`]/g, '')
    .replace(/\u2018|\u2019|\u00B4/g, '')
    .replace(/[^a-zA-Z\s&\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Four MSPWare acceptance buckets must sum to exactly 100 for OMNI. */
function normalizeAcceptanceSplit(cpIn: number, intIn: number, motoIn: number) {
  let cp = Math.max(0, Math.min(100, Math.round(cpIn)));
  let intPct = Math.max(0, Math.min(100, Math.round(intIn)));
  let motoPct = Math.max(0, Math.min(100, Math.round(motoIn)));
  const sum3 = cp + intPct + motoPct;
  if (sum3 > 100) {
    const room = Math.max(0, 100 - cp);
    const rest = intPct + motoPct;
    if (rest > 0) {
      intPct = Math.floor((intPct * room) / rest);
      motoPct = Math.max(0, room - intPct);
    } else {
      cp = 100;
    }
  }
  let cnp = Math.max(0, 100 - cp - intPct - motoPct);
  const total = cp + cnp + intPct + motoPct;
  if (total < 100) cnp += 100 - total;
  else if (total > 100) {
    const over = total - 100;
    if (cnp >= over) cnp -= over;
    else {
      const left = over - cnp;
      cnp = 0;
      cp = Math.max(0, cp - left);
    }
  }
  return { cp, cnp: Math.max(0, cnp), intPct, motoPct };
}

async function diagnoseMspTemplate(
  mspBase: string,
  headers: Record<string, string>,
  templateNo: number | string,
): Promise<string> {
  try {
    const res = await fetch(`${mspBase}/applications/${templateNo}`, { headers });
    const data = await res.json().catch(() => ({}));
    const app = data?.application || data?.data || data || {};
    const status = app.status || app.applicationstatus || app.ApplicationStatus || data?.status;
    const dba = app.dba || app.DBA || app.full_dba_name;
    if (!res.ok) {
      return `Template #${templateNo} GET HTTP ${res.status}` +
        (data?.error || data?.message ? `: ${data.error || data.message}` : ' (not found or inaccessible)');
    }
    return `Template #${templateNo} reachable (status=${status ?? '?'}, dba=${dba ?? '?'})`;
  } catch (e: any) {
    return `Template #${templateNo} diagnose failed: ${e.message}`;
  }
}

function tierToTemplate(tierKey: string): number {
  const CD = resolveCdTemplateNo();
  const DEF = resolveDefaultTemplateNo();
  const map: Record<string, number> = {
    'CUSTOM_FLAT_RATE': FLAT_TEMPLATE_NO,
    'CUSTOM_INTERCHANGE_PLUS': DEF,
    'SELF_SERVE_CASH_DISCOUNT': CD,
    'TRADITIONAL': DEF, 'STANDARD': DEF, 'PREMIUM': DEF,
    'CASH_DISCOUNT': CD, 'SELF_CASH_DISCOUNT': CD,
    'SELF_SWIPED': DEF, 'SELF_KEYED': DEF,
  };
  return map[tierKey] ?? DEF;
}

// Maps pricingTier -> MSPWare pricing_method and -> MSPWare template number.
// MerchantMID.pricingMethod has a schema-level default of 'ICPLS', which will
// silently mask this derivation if the field is left unset at create time —
// always set it explicitly at every MerchantMID creation site rather than
// relying on the schema default.
const TIER_TO_METHOD: Record<string, string> = {
  'CUSTOM_FLAT_RATE': 'FLAT',
  'CUSTOM_INTERCHANGE_PLUS': 'ICPLS',
  'SELF_SERVE_CASH_DISCOUNT': 'TIERD',
  // Legacy values — kept mapped for any historical/in-flight records that predate
  // the 2026-07-06 simplification. Do not use these for new merchants; use the
  // 3 canonical values above.
  'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS',
  // 2026-07-03: Teddy confirmed Cliqbux never uses MSPWare's "Clear and Simple"
  // pricing method — every Cash Discount plan uses "Tiered" (wire value TIERD)
  // instead, with a flat-rate fee schedule sent explicitly in buildFormPayload.
  // See docs/mspware-field-reference.md.
  'CASH_DISCOUNT': 'TIERD', 'SELF_CASH_DISCOUNT': 'TIERD',
  // ON HOLD 2026-07-06 — Elavon doesn't support self-serve flat rate yet; Cliqbux
  // cannot execute this agreement. Do not build a template for these or route real
  // merchants through them until Elavon adds support. See Critical Lesson #12.
  'SELF_SWIPED': 'ICPLS', 'SELF_KEYED': 'ICPLS',
};

// Pricing tiers that are ALWAYS a custom, individually-negotiated deal — no
// off-the-shelf template exists. buildFormPayload must source markup values from
// the merchant's own customMarkupPercentage/customPerTxFee, never a static constant,
// and must refuse to proceed if either is missing. See Critical Lesson #12.
const CUSTOM_PRICING_TIERS = ['CUSTOM_FLAT_RATE', 'CUSTOM_INTERCHANGE_PLUS'];
const LEGACY_UNCONFIGURED_TIERS = ['STANDARD', 'TRADITIONAL', 'PREMIUM', 'CUSTOM'];

function pricingNotReadyMessage(profile: any, tierKey: string): string | null {
  const name = profile?.legalName || 'this merchant';
  if (!tierKey || LEGACY_UNCONFIGURED_TIERS.includes(tierKey)) {
    return (
      `Pricing is not configured for "${name}" (pricingTier=${tierKey || 'unset'}). ` +
      `Open Admin → Applications → Pricing, choose Cash Discount or Custom fees, and click Save Pricing. ` +
      `Do not click HubSpot Sync afterward unless the HubSpot deal has processing_pricing_tier set — ` +
      `blank HubSpot tiers previously reset merchants to STANDARD.`
    );
  }
  if (CUSTOM_PRICING_TIERS.includes(tierKey) &&
      (profile.customMarkupPercentage == null || profile.customPerTxFee == null || profile.customAuthPerCard == null)) {
    return (
      `Custom pricing not yet set for "${name}" (pricingTier=${tierKey}). ` +
      `Your Cliqbux representative needs to set the negotiated markup, per-transaction fee, and per-auth fee ` +
      `on the deal before your application can be prepared. No application was created.`
    );
  }
  return null;
}

// ─── Value Mappings ───────────────────────────────────────────────────────────

function mapOwnershipType(t: string): string {
  const map: Record<string, string> = {
    'SOLE_PROP':        'SP',
    'SOLE_PROPRIETOR':  'SP',
    'LLC':              'LL',
    'LLC_CORPORATION':  'LL',
    'LLC_PARTNERSHIP':  'LL',
    'CORPORATION':      'CO',
    'C_CORP':           'CO',
    'S_CORP':           'SS',
    'SUB_S_CORP':       'SS',
    'PARTNERSHIP':      'PA',
    // BUG FIXED 2026-07-03: our own frontend's Business Entity Type dropdown
    // (OWNERSHIP_TYPES in OnboardingLocations.jsx) uses 'GENERAL_PARTNERSHIP'
    // and 'LIMITED_PARTNERSHIP' as values — neither matched any key here, so
    // both silently fell through to the 'CO' (Corporation) default instead of
    // 'PA' (Partnership). Confirmed by comparing our dropdown against MSPWare's
    // own Ownership Type field live.
    'GENERAL_PARTNERSHIP': 'PA',
    'LIMITED_PARTNERSHIP': 'PA',
    'LIMITED_COMPANY':  'LL',
    'NON_PROFIT':       'NP',
    'TRUST':            'T',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'CO';
}

// Maps LLC subtype → Elavon ClassificationCode (only used when ownership_type = 'LL')
// Confirmed valid from live apps: "C" (C-corp election), "P" (partnership), "D" (disregarded entity)
function mapLlcClass(t: string): string {
  const map: Record<string, string> = {
    'LLC':              'D',
    'LLC_PARTNERSHIP':  'P',
    'LLC_CORPORATION':  'C',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'D';
}

function mapOwnerTitle(t: string): string {
  const map: Record<string, string> = {
    // Full enum values from MerchantSigners / MerchantCorporateProfile entities
    'CHIEF_EXECUTIVE_OFFICER': 'CEO',
    'CHIEF_FINANCIAL_OFFICER':  'CFO',
    'PRESIDENT':                'P',
    'VICE_PRESIDENT':           'VP',
    'DIRECTOR':                 'D',
    'SECRETARY':                'S',
    'TREASURER':                'T',
    'MANAGING_MEMBER':          'MM',
    'AUTHORIZED_SIGNER':        'OP',
    'OWNER':                    'OP',
    'PROPRIETOR_OR_OWNER':      'OP',
    'PARTNER':                  'PP',
    'PARTNER_OR_PRINCIPAL':     'PP',
    'MANAGER':                  'GM',
    'GENERAL_MANAGER':          'GM',
    // Short aliases
    'CEO':    'CEO',
    'CFO':    'CFO',
    'COO':    'COO',
    'VP':     'VP',
    'MM':     'MM',
  };
  return map[t] || map[t?.toUpperCase?.()] || 'OP';
}

// Maps pricing category number → Elavon IndustryCode
// Confirmed from live approved apps: RE=Retail, RS=Restaurant, SP=Supermarket
function mapIndustryType(pricingCategory: string): string {
  const map: Record<string, string> = {
    '1':  'RE',
    '2':  'HT',
    '4':  'SP',
    '5':  'ARU',
    '6':  'MS',
    '7':  'RS',
    '13': 'RE',
  };
  return map[pricingCategory] || 'RE';
}

// Reverse of mapIndustryType — used to derive pricingCategory from an explicitly
// chosen industryType when pricingCategory itself was never set. The current MID
// editor UI only exposes "MCC Code" + "Industry Type" (no Pricing Category field),
// so pricingCategory is frequently null even when industryType is correctly set.
const INDUSTRY_TO_CATEGORY: Record<string, string> = {
  'RE': '1', 'HT': '2', 'SP': '4', 'ARU': '5', 'MS': '6', 'RS': '7',
};

function cleanDigits(s: string): string {
  return (s || '').replace(/\D/g, '');
}

// Strips SSN and bank account/routing numbers before logging — recurses into
// arrays (e.g. owners[]) so additional-owner SSNs are caught too.
const SENSITIVE_LOG_KEYS = new Set(['owner_id_number', 'ssn', 'deposit_account_no', 'deposit_account_rtg']);
function redactSensitive(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  if (obj && typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj as Record<string, any>)) {
      out[k] = SENSITIVE_LOG_KEYS.has(k) ? '[REDACTED]' : redactSensitive(v);
    }
    return out;
  }
  return obj;
}

// When a location was saved via the "unverified" path, structured fields may be null.
// Parse them from the flat businessAddress string as a fallback.
function resolveLocationAddress(location: Record<string, any>): Record<string, any> {
  if (location.businessStreet && location.businessCity && location.businessState) return location;
  const flat = location.businessAddress || '';
  const m = flat.match(/^(.+?),\s*(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (!m) return location;
  return {
    ...location,
    businessStreet: location.businessStreet || m[1].trim(),
    businessCity:   location.businessCity   || m[2].trim(),
    businessState:  location.businessState  || m[3].toUpperCase(),
    businessZip:    location.businessZip    || m[4].trim(),
  };
}

// MSPWare only accepts the 50 US states — territories (GU, PR, VI, AS, MP) cause data errors
const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
function sanitizeState(s: string): string {
  const code = (s || '').toUpperCase().trim();
  return US_STATES.has(code) ? code : '';
}

// Maps our internal industryClass enum → MSPWare industry_type code
function industryClassToMSP(cls: string): string {
  const map: Record<string, string> = {
    'RESTAURANT': 'RS',
    'GROCERY':    'SP',
    'HOTEL':      'HT',
    'ECOMMERCE':  'MS',
    'SERVICES':   'RE',
    'RETAIL':     'RE',
    'AUTO':       'RE',
    'HEALTH':     'RE',
    'SALON':      'RE',
    'GYM':        'RE',
    'BAR':        'RS',
    'CLOTHING':   'RE',
    'ELECTRONICS':'RE',
    'FURNITURE':  'RE',
  };
  return map[cls] || 'RE';
}

function formatDob(year: string, month: string, day: string): string {
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ─── Form Payload Builder ─────────────────────────────────────────────────────
//
// STRICT TEMPLATE PRESERVATION RULE — READ BEFORE EDITING
// =========================================================
// MSPWare templates (#6 ICPLS, #154 Cash Discount) pre-fill a large set of
// fee schedule, equipment, and account configuration fields. Sending ANY of
// those fields in a PUT /form payload OVERWRITES the template value — even
// if you send the same value the template already has. This causes form
// completion to drop below 100%, blocking signing.
//
// buildFormPayload sends ONLY the merchant-specific fields listed below.
// The following are intentionally OMITTED for ICPLS (non-Cash-Discount) merchants
// because the template owns them:
//
//   billing_method, billing_frequency, funding_type, monetary_code, statement_type,
//   monthly_minimum_fee, chargeback_fee, account_maintenance_fee, rtp_monthly_fee,
//   touch_tone_auth, avs_service_auth, bank_referral_auth, op_assisted_auth,
//   C4_surcharging_cardholder_surcharge, tokenization_service_fee,
//   tokenization_platform_fee, tokenization_sharing_indicator,
//   has_pin_debit, debit_auth_method, debit_pricing_method,
//   all per-network debit interchange fee fields (ACCL_*, AFFN_*, ALAS_*, CU24_*,
//   INKL_*, MSTO_*, NETS_*, NYCE_*, POSD_*, PULSE_*, ITS_*, STAR_*, UPDBT_*),
//   fixed_individual_tiers_pricing, multi_currency_conversion, secure3d,
//   all_markup_discount, all_markup_per_item, all_card_auth_per_item,
//   intl_card_handling_fee, auth_pricing_program, annual_fee_start_date,
//   is_firearm_verified (CRITICAL: every value is rejected by the API; omit always
//   — this is a template-level default that needs fixing directly on templates
//   #6/#154 in MSPWare, not something this function can send. See AGENTS.md.
//   2026-07-03: Teddy confirmed this field only appears/is required for certain
//   business address states; when it appears the correct answer is "No", but it
//   must be fixed on the template, never sent via payload.)
//
// If you need to add a new field, verify it is NOT in the template by reading
// the template via GET /applications/154/form before adding it here.
//
// EXCEPTION 1 — Cliqbux Program Configuration fields (entity_number, safet_service,
// safet_fee, tokenization): these look like template-owned config but are actually
// Cliqbux business/reseller settings that no template can supply per-merchant. See
// the "Cliqbux Program Configuration" block below for the confirmed values and why.
// `tokenization: 'none'` is sent for ALL merchants (not just Cash Discount) —
// confirmed by Teddy 2026-07-03: "No tokenization is available to us now." This
// also means `tokenization_platform_fee`/`tokenization_service_fee` are moot and
// stay omitted.
//
// EXCEPTION 2 — Cash Discount (pricing_method: 'TIERD') fee schedule: Cliqbux
// NEVER uses MSPWare's "Clear and Simple" pricing method (confirmed by Teddy
// 2026-07-03 — "We do not use clear and simple for pricing method ever. Tiered
// only."). Because template #154 was built around Clear and Simple, its Tiered-
// method fields aren't reliable, so for Cash Discount merchants ONLY,
// buildFormPayload explicitly sends the flat-rate fee schedule (billing_method,
// auth_pricing_program, monetary_pricing_program, all_*_discount/per_item tiers,
// debit fields, touch_tone_auth/avs_service_auth/bank_referral_auth/op_assisted_auth,
// intl_card_handling_fee) instead of omitting them. ICPLS merchants are NOT
// affected — those fields remain omitted/template-owned for ICPLS as before. See
// the "Cliqbux Cash Discount Fee Schedule" block below and
// docs/mspware-field-reference.md.
//
// EXCEPTION 3 — Custom Flat Rate / Custom Interchange Plus markup: unlike ICPLS's
// other fields, `all_markup_discount`/`all_markup_per_item` can NEVER be template-
// owned for these 2 tiers because Cliqbux has no off-the-shelf rate for them — every
// deal is individually negotiated (confirmed by Teddy 2026-07-06). These are sent
// explicitly, sourced from the merchant's own `customMarkupPercentage`/
// `customPerTxFee` (captured from HubSpot), gated by a hard guard that throws if
// either is missing rather than silently creating a blank-pricing application. See
// the "Custom Flat Rate / Custom Interchange Plus markup" block below and AGENTS.md
// Critical Lesson #12.
//
// Merchant-supplied fields sent here:
//   full_dba_name, legal_dba_name, products_or_services, year_business_established,
//   ownership_years/months, ownership_type, tin/ssn, llc_class, industry_type,
//   contact_first/last_name, business_phone/email, business_address (all parts),
//   has_legal_address / mailing_address (when entity has separate mailing address),
//   owners[] (all signer fields), has_intermediary_businesses,
//   beneficial_ownership_exemption, owner_confirmed, annual_revenue, monthly_sales,
//   average_sales, highest_ticket, freq_highest_average_ticket,
//   cp_percent, cnp_percent, int_percent, moto_percent, delayed_delivery,
//   cards_accepted, card_acceptance_split, mcc, pricing_method, pricing_category,
//   deposit_account_no/rtg/type (bank — only when both routing+account present),
//   statement_delivery_method, chargebacks_retrievals_format/email,
//   state_of_formation, currently_processing, seasonal_business, refund_policy

function buildFormPayload(
  profile: Record<string, any>,
  location: Record<string, any>,
  merchantMID: Record<string, any>,
  primarySigner: Record<string, any>,
  additionalSigners: Record<string, any>[],
  entityMailing?: { street: string; city: string; state: string; zip: string } | null
): Record<string, unknown> {

  const signer = primarySigner || {};

  // Bank: merchantMID-level account overrides location (e.g. bakery settles to different account)
  const bank = merchantMID.bankDetails || location.bankDetails || {};
  const routing = bank.routingNumber || location.routingNumber || '';
  const account = bank.accountNumber || location.accountNumber || '';

  // profile.taxId is a flat field the self-serve flow never actually populates —
  // the merchant's EIN is instead captured per-entity under profile.legalEntities[].federalEIN.
  // Match the entity tied to this location; fall back to the first entity if unmatched.
  const matchedEntity = (profile.legalEntities || []).find((e: any) => e.entityId === location.entityId) || profile.legalEntities?.[0];
  const taxId = cleanDigits(profile.taxId || matchedEntity?.federalEIN || '');
  const ssn = cleanDigits(signer.ssn || profile.ssn || '');
  const phone = cleanDigits(signer.corporatePhone || profile.corporatePhone || '');

  // MerchantMID-level fields override profile-level for per-MID differentiation
  // BUG FIXED 2026-07-03: previously required BOTH pricingCategory AND industryType
  // to be set on merchantMID before trusting the explicit industryType — but the
  // current MID editor UI only exposes "MCC Code" + "Industry Type" (no Pricing
  // Category field), so pricingCategory is normally null even when industryType
  // is correctly chosen (e.g. "Restaurant (RS)"). That silently discarded the
  // merchant's real industry and always fell back to Retail. Now: trust an
  // explicit industryType directly, and derive pricingCategory FROM it (via
  // INDUSTRY_TO_CATEGORY) when pricingCategory itself was never set.
  const pricingCategory = String(
    merchantMID.pricingCategory || profile.pricingCategory
    || (merchantMID.industryType && INDUSTRY_TO_CATEGORY[merchantMID.industryType])
    || '1'
  );
  // TIER_TO_METHOD is declared once at module scope above — used here and by
  // every MerchantMID creation site in this file.
  const rawPricingMethod = merchantMID.pricingMethod || profile.pricingMethod
    || TIER_TO_METHOD[(merchantMID.pricingTier || profile.pricingTier || '').toUpperCase()]
    || 'ICPLS';
  const pricingMethod = rawPricingMethod.toUpperCase() === 'CASH_DISCOUNT' ? 'TIERD' : rawPricingMethod;

  // GUARD (2026-07-06 / 2026-07-14): Custom tiers need fees; legacy STANDARD = not configured.
  const tierKey = (merchantMID.pricingTier || profile.pricingTier || '').toUpperCase();
  const pricingBlock = pricingNotReadyMessage(profile, tierKey);
  if (pricingBlock) throw new Error(pricingBlock);
  // Used below to attach negotiated markup fields — CD / TIERD never send these.
  const isCustomPricingTier = CUSTOM_PRICING_TIERS.includes(tierKey);

  const industryType = merchantMID.industryType || mapIndustryType(pricingCategory);
  // 2026-07-13: NEVER default to 5999. That code is a restricted category
  // (MSPWare/Elavon reject it for CA/CO/NY) and was silently poisoning drafts
  // created before the merchant picked a real MCC. Fail loudly instead.
  const mcc = String(merchantMID.mccCode || profile.mccCode || '').trim();
  if (!mcc) {
    throw new Error(
      `MCC code is required before creating or filling an MSPWare application for "${merchantMID.dbaName || merchantMID.merchantName || 'this MID'}". ` +
      `Set the MCC on the MID in Locations & MIDs, then try again.`
    );
  }
  if (mcc === '5999') {
    throw new Error(
      `MCC 5999 is not allowed (restricted merchant category — rejected in CA/CO/NY). ` +
      `Choose a specific retail MCC on the MID in Locations & MIDs.`
    );
  }
  const dbaName = merchantMID.dbaName || location.dbaName || profile.legalName || '';
  const monthlyCardSales = Math.max(1, parseFloat(String(merchantMID.monthlyCardSales || profile.monthlyCardSales || '6000')) || 6000);
  const rawAvg = parseFloat(String(merchantMID.avgSaleAmount || profile.avgSaleAmount || '100')) || 100;
  const rawHighest = parseFloat(String(merchantMID.highestTicketAmount || profile.highestTicketAmount || '200')) || 200;
  // MSPWare rules:
  // 1. average_sales must be LESS THAN monthly_sales
  // 2. highest_ticket must be STRICTLY GREATER THAN average_sales AND less than monthly_sales
  const cap = Math.max(monthlyCardSales - 1, 1);
  const avgSaleAmount = String(Math.min(rawAvg, cap));
  const minHighest = Math.min(rawAvg, cap) + 1; // at least 1 more than average
  const highestTicketAmount = String(Math.min(Math.max(rawHighest, minHighest), cap));
  // MSPWare rule: delayed_delivery must be >= 1
  const rawDelay = parseInt(String(merchantMID.deliveryDelayDays ?? profile.deliveryDelayDays ?? '0'), 10);
  const deliveryDelayDays = String(Math.max(rawDelay, 1));
  // cardPresentPct: treat null/undefined as 100 (in-person default), NOT 0
  const rawCpPct = merchantMID.cardPresentPct != null ? merchantMID.cardPresentPct : (profile.cardPresentPct != null ? profile.cardPresentPct : 100);
  // NOTE: || 100 here previously turned a legitimate 0% card-present into 100%
  // (0 is falsy) — only default when the value is genuinely absent/NaN.
  const parsedCpPct = parseInt(String(rawCpPct), 10);
  const cardPresentPct = Math.max(0, Math.min(100, Number.isFinite(parsedCpPct) ? parsedCpPct : 100));
  // MSPWare has FOUR acceptance buckets (cp / cnp-keyed / internet / moto) that
  // must sum to 100, and rejects cnp_percent >= 100. The portal collects three
  // (in-person / online / moto), so cnp is the RESIDUAL keyed portion — with a
  // 100-total portal split it is always 0. The old formula (100 - cp) double-
  // counted internet/moto and produced cnp_percent: 100 for online merchants,
  // which the processor rejected (observed live 2026-07-10, app #210).
  const midIntPct  = Math.max(0, Math.min(100, parseInt(String(merchantMID.internetPct ?? profile.internetPct ?? 0), 10) || 0));
  const midMotoPct = Math.max(0, Math.min(100, parseInt(String(merchantMID.motoPct ?? profile.motoPct ?? 0), 10) || 0));
  // Normalize so cp+cnp+int+moto === 100 (Omni-Commerce rejects other totals — Porky's 2026-07-14).
  const split = normalizeAcceptanceSplit(cardPresentPct, midIntPct, midMotoPct);
  const cardPresentPctNorm = split.cp;
  const cnpPct = split.cnp;
  const intPct  = String(split.intPct);
  const motoPct = String(split.motoPct);

  const ownershipRaw = profile.ownershipType || matchedEntity?.ownershipType || profile.taxClassType || '';
  const ownershipType = mapOwnershipType(ownershipRaw);
  const isLLC = ownershipType === 'LL';
  // BUG FIXED 2026-07-03: llc_class was being derived from `ownershipRaw` (whichever
  // of ownershipType/taxClassType happened to resolve first), which is the WRONG
  // field — mapLlcClass expects taxClassType-style values (LLC/LLC_PARTNERSHIP/
  // LLC_CORPORATION), but ownershipRaw often resolves to an ownershipType-style
  // value instead (e.g. "LIMITED_COMPANY"), which isn't in mapLlcClass's table and
  // silently fell through to the 'D' (disregarded entity) default — even for a
  // merchant explicitly set to "LLC taxed as C-Corp". taxClassType lives per-entity
  // (profile.legalEntities[].taxClassType), matched the same way as federalEIN.
  const legalTaxClassType = matchedEntity?.taxClassType || profile.taxClassType || '';

  const annualRevenue = String(
    profile.annualRevenue || (parseInt(monthlyCardSales, 10) * 12)
  );

  const additionalOwners = additionalSigners.map(s => ({
    owner_responsible_party: false,
    owner_personal_guarantee: !!s.signsPersonalGuarantee,
    principal_sign_agreement: !!s.isAuthorizedSigner,
    ownership_percent: String(s.ownershipPercentage || '0'),
    owner_title: mapOwnerTitle(s.titleType || ''),
    owner_firstname: s.firstName || '',
    owner_middlename: s.middleName || '',
    owner_lastname: s.lastName || '',
    owner_dob: formatDob(s.dobYear, s.dobMonth, s.dobDay),
    owner_phone: cleanDigits(s.corporatePhone || profile.corporatePhone || ''),
    owner_email: s.signerEmail || '',
    owner_country: 'USA',
    owner_address_type: 'PRA',
    owner_address: s.homeStreet || '',
    owner_city: s.homeCity || '',
    owner_state_usa: sanitizeState(s.homeState),
    owner_zipcode: s.homeZip || '',
    owner_citizenship_country_1: 'USA',
    owner_id_type: 'SSN',
    owner_id_number: cleanDigits(s.ssn || ''),
  }));

  return {
    // ── Merchant Information ──────────────────────────────────────────────────
    full_dba_name: sanitizeFullDbaName(dbaName),
    legal_dba_name: sanitizeLegalDbaName(profile.legalName || dbaName || ''),
    products_or_services: profile.productDescription || 'Retail goods and services',
    year_business_established: String(profile.establishmentYear || new Date().getFullYear() - 3),
    ownership_years: String(profile.currentOwnershipYears || '1'),
    ownership_months: String(profile.currentOwnershipMonths || '0'),
    ownership_type: ownershipType,
    // Only send TIN/SSN when non-empty — MSPWare rejects the ENTIRE payload for invalid formats
    ...(taxId ? { tin: taxId } : {}),
    ...(!taxId && ssn ? { ssn } : {}),
    ...(isLLC ? { llc_class: mapLlcClass(legalTaxClassType || ownershipRaw) } : {}),
    country_formation: 'USA',
    country_operations: 'USA',
    industry_type: industryType,

    // ── Addresses ────────────────────────────────────────────────────────────
    contact_first_name: signer.firstName || '',
    contact_last_name: signer.lastName || '',
    business_phone: phone,
    customer_service_phone: phone,
    business_email: signer.signerEmail || profile.signerEmail || '',
    business_address_type: 'BSA',
    business_address: location.businessStreet || location.businessAddress || '',
    business_city: location.businessCity || '',
    business_state_usa: location.businessState || '',
    business_zipcode: location.businessZip || '',
    // If entity has a separate mailing address, send it as the legal address.
    // Confirmed via live resubmit: has_legal_address: 'new' is the correct value
    // (was 'mailing', rejected as invalid). Once corrected, MSPWare required a
    // distinct legal_* field block (legal_country/legal_address_type/legal_address/
    // legal_city/legal_state_usa/legal_zipcode) — NOT the mailing_* names this
    // code previously sent, which were silently dropped as unrecognized fields.
    ...(entityMailing?.street ? {
      has_legal_address: 'new',
      legal_country: 'USA',
      legal_address_type: 'BSA',
      legal_address: entityMailing.street,
      legal_city: entityMailing.city,
      legal_state_usa: sanitizeState(entityMailing.state),
      legal_zipcode: entityMailing.zip,
    } : {
      has_legal_address: 'business',
    }),

    // ── Principals ───────────────────────────────────────────────────────────
    owners: [
      {
        owner_responsible_party: true,
        owner_personal_guarantee: true,
        principal_sign_agreement: true,
        ownership_percent: String(signer.ownershipPercentage || profile.ownershipPercentage || '100'),
        owner_title: mapOwnerTitle(signer.titleType || profile.titleType || ''),
        owner_firstname: signer.firstName || '',
        owner_middlename: signer.middleName || '',
        owner_lastname: signer.lastName || '',
        owner_dob: formatDob(
          signer.dobYear || profile.dobYear,
          signer.dobMonth || profile.dobMonth,
          signer.dobDay || profile.dobDay
        ),
        owner_phone: phone,
        owner_email: signer.signerEmail || profile.signerEmail || '',
        owner_country: 'USA',
        owner_address_type: 'PRA',
        owner_address: signer.homeStreet || profile.homeStreet || '',
        owner_city: signer.homeCity || profile.homeCity || '',
        owner_state_usa: sanitizeState(signer.homeState || profile.homeState || '') || sanitizeState(location.businessState || ''),
        owner_zipcode: signer.homeZip || profile.homeZip || '',
        owner_citizenship_country_1: 'USA',
        owner_id_type: 'SSN',
        owner_id_number: ssn,
      },
      ...additionalOwners,
    ],
    has_intermediary_businesses: false,
    beneficial_ownership_exemption: 'NON',
    owner_confirmed: true,

    // ── Financial Information ─────────────────────────────────────────────────
    annual_revenue: annualRevenue,
    monthly_sales: String(monthlyCardSales),
    average_sales: avgSaleAmount,
    highest_ticket: highestTicketAmount,
    freq_highest_average_ticket: String(profile.highestTicketFrequency || '24'),
    cp_percent: String(cardPresentPctNorm),
    cnp_percent: String(cnpPct),
    int_percent: intPct,
    moto_percent: motoPct,
    delayed_delivery: deliveryDelayDays,

    // ── Card Acceptance ───────────────────────────────────────────────────────
    // cards_accepted / all_cards intentionally OMITTED as of 2026-07-08 — template #133
    // has all_cards: true (accept every card type, including UnionPay). Sending an
    // explicit cards_accepted list here overwrote that with a fixed 6-card list and
    // silently dropped UnionPay + the "All Cards" toggle on every application. Let
    // the template's own value pass through untouched, same as other template-owned
    // fields. See AGENTS.md.
    card_acceptance_split: cardPresentPctNorm >= 100 ? 'CP' : 'OMNI',

    // ── Industry / MCC ────────────────────────────────────────────────────────
    mcc,

    // ── Pricing (merchant-specific only — all fee/rate/config fields omitted; template owns them) ──
    pricing_method: pricingMethod,
    pricing_category: pricingCategory,
    // NOTE: billing_method, annual_fee_start_date, auth_pricing_program, all_markup_*,
    // intl_card_handling_fee, tokenization_*, has_pin_debit, debit_*, all ACCL_*/AFFN_*/etc
    // per-network debit fields, and is_firearm_verified are all intentionally omitted.
    // See the STRICT TEMPLATE PRESERVATION RULE comment above buildFormPayload.

    // ── Cliqbux Program Configuration ──────────────────────────────────────────
    // These are NOT merchant-derived — they're fixed Cliqbux business/reseller
    // settings in MSPWare that were incorrectly assumed to be template-owned.
    // Confirmed with Teddy 2026-07-03:
    //   - entity_number: Cliqbux's MSPWare reseller/compensation-model record.
    //     "48603 - Buy rate" is the correct entity for all merchants (not the
    //     "48605 - Clear & simple" entity a first guess might reach for).
    //   - safet_service / safet_fee: PCI compliance program. Fee is a junk fee —
    //     always send $0. Program tier defaulted to PCI Basic ('pci'); confirm
    //     with Teddy if PCI Plus ('pciplus') should be used instead.
    //   - CLEAR_plan is intentionally NOT sent: Teddy confirmed it's a legacy
    //     rate-plan picklist Cliqbux no longer offers. If MSPWare still marks it
    //     required after these other fixes, that needs a Fidano/MSPWare support
    //     ticket rather than a guessed value here.
    //   - entity_number CORRECTED 2026-07-03: the real wire value is '48603-17',
    //     not '48603'. The "-17" is Cliqbux's MSPWare Client Group ID — MSPWare's
    //     search box only displays "48603 - Buy rate" but silently combines it
    //     with the Client Group behind the scenes. Confirmed via raw GET
    //     /applications/133/form (Teddy's reference "Cash Discount Template"
    //     with Entity actually selected in the live UI) — see
    //     docs/mspware-field-reference.md.
    //   - tokenization ADDED 2026-07-03: Teddy confirmed "No tokenization is
    //     available to us now" — sent as 'none' for ALL merchants (not just Cash
    //     Discount), overriding template #154's stale 'token' default, which was
    //     the actual cause of the "Tokenization Platform Fee" required-field error.
    entity_number: '48603-17',
    safet_service: 'pci',
    safet_fee: '0',
    tokenization: 'none',

    // ── Cliqbux Cash Discount Fee Schedule (Tiered pricing only) ───────────────
    // Cliqbux never uses MSPWare's "Clear and Simple" pricing method — confirmed
    // by Teddy 2026-07-03. Cash Discount merchants use pricing_method: 'TIERD'
    // ("Tiered") instead, which requires its own explicit fee schedule (template
    // #154 was built around Clear and Simple, so its Tiered fields aren't
    // reliable). These values were confirmed live by Teddy on 2026-07-03. ICPLS
    // merchants are unaffected — this block only applies when pricingMethod is
    // Cash Discount's wire value. See docs/mspware-field-reference.md.
    ...(pricingMethod === 'TIERD' ? {
      billing_method: 'N',
      monetary_pricing_program: '09828',
      auth_pricing_program: '49999',
      all_qualified_discount: '3.3816',     all_qualified_per_item: '0.000',
      all_mid_qualified_discount: '3.3816', all_mid_qualified_per_item: '0.000',
      all_non_qualified_discount: '3.3816', all_non_qualified_per_item: '0.000',
      all_standard_discount: '3.3816',      all_standard_per_item: '0.000',
      all_rewards_discount: '3.3816',       all_rewards_per_item: '0.000',
      has_pin_debit: true,
      debit_auth_method: 'FIXED',
      debit_pricing_method: 'SURCH',
      apply_all_pin_debit: true,
      all_networks_percent_fee: '3.3816',
      all_networks_per_auth: '0',
      all_networks_transaction_fee: '0',
      pin_debit_monthly_fee: '0',
      intl_card_handling_fee: '0',
      all_card_auth_per_item: '0',
      touch_tone_auth: '0',
      avs_service_auth: '0',
      bank_referral_auth: '0',
      op_assisted_auth: '0',
    } : {}),

    // ── Custom Flat Rate / Custom Interchange Plus markup (individually negotiated) ──
    // These 2 tiers are ALWAYS a custom, per-merchant negotiated deal — never a
    // static Cliqbux-wide rate. The guard above already refused to reach this point
    // if either value were missing, so it's safe to send them here. auth-per-card
    // stays a fixed template-level value (all_card_auth_per_item) per Teddy
    // 2026-07-06 — no separate custom field needed for it. See Critical Lesson #12.
    ...(isCustomPricingTier ? {
      all_markup_discount: String(profile.customMarkupPercentage),
      all_markup_per_item: String(profile.customPerTxFee),
      // 2026-07-09: auth-per-card is now ALSO per-deal for custom tiers (Teddy —
      // supersedes the 2026-07-06 "template-level only, no custom field" decision).
      // HubSpot prompts all three values on custom-tier deals.
      all_card_auth_per_item: String(profile.customAuthPerCard),
    } : {}),

    // ── Cliqbux Standard Equipment Configuration ───────────────────────────────
    // Cliqbux ships and manages equipment deployment separately from the MSPWare
    // application — every merchant gets the SAME static hardware/VAR config here.
    // This is NOT merchant-configurable; do not expose it in the UI or derive it
    // from location/profile data. Confirmed with Teddy 2026-07-03 by reading the
    // raw form of MSPWare's "Cash Discount Template" (app #133) via
    // debugMSPFormRaw — these are exact wire values, not guesses. See
    // docs/mspware-field-reference.md for the full breakdown and how to update
    // this if the equipment lineup ever changes.
    foreign_network: 'NOVA',        // Network Type = "Elavon" in the UI
    equipment_rush_request: 'XX',   // POS Delivery = "Shipping Not Needed"
    eqp_hardware_section: [{
      hardware_type: 'CNVNG',            // Converge New Generation
      hardware_ownership: 'P',           // Purchase
      hardware_qty: '1',
      hardware_price_per: '0',
      hardware_connection_type: 'IP',
      hardware_capture_method: 'HYBRD',  // Hybrid
      hardware_close_method: 'AUTO',
      hardware_training_method: 'NO',    // No Training
    }],
    eqp_var_section: [
      {
        var_type: 'vendor_distributed',
        var_vendor: 'V7080',    // PAX Technology Inc
        var_product: '13231',   // Broad POS Elavon v1.0
        var_gateway: 'NONE',
        var_qty: '4',
        var_price: '0.00',
        var_capture_method: 'HOST',
        var_close_method: 'AUTO',
      },
      {
        var_type: 'service_provider',
        var_provider: 'V6273',  // Network Merchants, Inc
        var_product: '11198',   // Gateway Processing Services 10.04
        var_qty: 1,
        var_price: '0.00',
        var_capture_method: 'HOST',
        var_close_method: 'AUTO',
      },
    ],

    // ── Bank Accounts (only when both routing + account are present) ──────────
    ...(routing && account ? {
      deposit_account_no: account,
      deposit_account_rtg: routing,
      deposit_account_type: bank.accountType === 'savings' ? 'SA' : 'CK',
    } : {}),

    // ── Statements + remaining merchant fields ────────────────────────────────
    statement_delivery_method: 'E',
    chargebacks_retrievals_format: 'WM',
    chargebacks_retrievals_email: signer.signerEmail || profile.signerEmail || '',
    state_of_formation: location.businessState || profile.stateOfFormation || '',
    currently_processing: profile.currentlyProcessing ? 'Y' : 'N',
    ...(profile.currentlyProcessing ? {
      current_processor_name: profile.currentProcessorName || '',
    } : {}),
    seasonal_business: profile.isSeasonal ? 'Y' : 'N',
    refund_policy: profile.refundPolicy || 'R',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { corporateId, midIds, locationIds } = body;

    if (!corporateId) return Response.json({ error: 'corporateId is required' }, { status: 400 });

    const actor = await getPortalActor(req, base44);
    if (!actor || (actor.actor === 'merchant' && actor.corporateId !== String(corporateId))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const salespersonId = parseInt(Deno.env.get('MSP_SALESPERSON_ID') || '0', 10);
    const submitEnabled = Deno.env.get('MSP_SUBMIT_ENABLED') === 'true';

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY env var not set' }, { status: 500 });

    const mspHeaders = {
      'X-API-KEY': apiKey,
      'X-App-ID':  appId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // ── Fetch merchant data ────────────────────────────────────────────────────
    const [profiles, allMerchantMIDs, allLocs, signers] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantMID.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

    // ── Early custom-pricing guard (2026-07-10 / 2026-07-14) ──────────────────
    {
      const tierKeyEarly = (profile.pricingTier || '').toUpperCase();
      const earlyBlock = pricingNotReadyMessage(profile, tierKeyEarly);
      if (earlyBlock) {
        return Response.json({ error: earlyBlock }, { status: 422 });
      }
    }

    // ── Auto-create merchantMIDs for new merchants who have locations but no merchantMIDs yet ──
    // This covers the standard onboarding flow: merchant adds location(s) via the UI,
    // then clicks Submit on the verification page before the tree UI / migration creates merchantMIDs.
    let merchantMIDsCreatedAuto = 0;
    if (!allMerchantMIDs?.length && allLocs?.length) {
      console.log(`[submitToMSP] No merchantMIDs found — auto-creating from ${allLocs.length} location(s)`);
      for (const loc of allLocs) {
        try {
          await base44.asServiceRole.entities.MerchantMID.create({
            locationId:      loc.id,
            corporateId,
            merchantName:     loc.dbaName || profile.legalName,
            dbaName:         loc.dbaName || profile.legalName,
            // Do not invent an MCC — blank until the merchant picks one in the portal.
            // buildFormPayload will refuse to fill MSPWare until mccCode is set.
            mccCode:         profile.mccCode || profile.mcc || '',
            industryType:    profile.industryClass ? industryClassToMSP(profile.industryClass) : 'RE',
            pricingCategory: '1',
            // Derived from profile.pricingTier — was previously hardcoded 'ICPLS'
            // regardless of tier, which silently broke Cash Discount merchants
            // whose applications get auto-created via this fallback path.
            pricingMethod:   TIER_TO_METHOD[(profile.pricingTier || '').toUpperCase()] || 'ICPLS',
            monthlyCardSales:    parseFloat(String(profile.monthlyCardSales || '0')) || null,
            avgSaleAmount:       parseFloat(String(profile.avgSaleAmount || '0')) || null,
            highestTicketAmount: parseFloat(String(profile.highestTicketAmount || '0')) || null,
            cardPresentPct:      parseFloat(String(profile.cardPresentPct || '100')) || 100,
            applicationStepStatus: 'In Review',
          });
          merchantMIDsCreatedAuto++;
        } catch (err: any) {
          console.warn(`[submitToMSP] Could not auto-create merchantMID for location ${loc.id}: ${err.message}`);
        }
      }
      // Re-fetch merchantMIDs now that we've created them
      const freshMerchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId });
      allMerchantMIDs.push(...(freshMerchantMIDs || []));
    }

    if (!allMerchantMIDs?.length) return Response.json({ error: 'No processing merchantMIDs found and no locations to derive them from' }, { status: 404 });

    // Build a locationId → location lookup for fast joins
    const locationMap: Record<string, any> = {};
    for (const loc of (allLocs || [])) {
      if (loc?.id != null) locationMap[String(loc.id)] = loc;
      if (loc?.locationId != null) locationMap[String(loc.locationId)] = loc;
    }

    // Build a entityId → mailing address lookup from profile's legalEntities
    const entityMailingMap: Record<string, any> = {};
    let legalEntitiesRaw = profile.legalEntities ?? [];
    if (typeof legalEntitiesRaw === 'string') {
      try { legalEntitiesRaw = JSON.parse(legalEntitiesRaw); } catch { legalEntitiesRaw = []; }
    }
    for (const ent of (Array.isArray(legalEntitiesRaw) ? legalEntitiesRaw : [])) {
      if (ent.entityId && ent.mailingStreet && ent.mailingCity && ent.mailingState) {
        entityMailingMap[ent.entityId] = { street: ent.mailingStreet, city: ent.mailingCity, state: ent.mailingState, zip: ent.mailingZip || '' };
      }
    }

    // Filter merchantMIDs if caller specified specific IDs
    let merchantMIDs = allMerchantMIDs;
    if (midIds?.length) {
      merchantMIDs = merchantMIDs.filter((c: any) => midIds.includes(c.id));
    } else if (locationIds?.length) {
      // Backward-compat: callers that pass locationIds get merchantMIDs for those locations
      merchantMIDs = merchantMIDs.filter((c: any) => locationIds.includes(c.locationId));
    }

    const primarySigner = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0] || {};
    const additionalSigners = signers?.filter((s: any) => !s.isPrimarySigner) || [];

    const results = [];
    let allSuccessful = true;

    for (const merchantMID of merchantMIDs) {
      // ── Skip already-boarded merchantMIDs ────────────────────────────────────────
      if (['Pending MID', 'Active', 'Active (Existing)'].includes(merchantMID.applicationStepStatus)) {
        results.push({
          midId: merchantMID.id,
          locationId: merchantMID.locationId,
          dbaName: merchantMID.dbaName,
          status: 'skipped',
          reason: `Already ${merchantMID.applicationStepStatus}`,
        });
        continue;
      }

      // ── Require a real MCC before any MSPWare draft / form PUT ──────────────
      // Creating a draft with a placeholder MCC (formerly 5999) poisons the form
      // and can roll back other fields on state-restricted validation failures.
      const midMcc = String(merchantMID.mccCode || profile.mccCode || '').trim();
      if (!midMcc || midMcc === '5999') {
        results.push({
          midId: merchantMID.id,
          locationId: merchantMID.locationId,
          dbaName: merchantMID.dbaName,
          status: 'skipped',
          reason: !midMcc
            ? 'MCC code not set yet — draft deferred until Locations & MIDs is saved with an MCC'
            : 'MCC 5999 is not allowed (restricted category) — choose a specific retail MCC',
        });
        continue;
      }

      // ── Join to location for address + fallback bank ──────────────────────
      const location = resolveLocationAddress(
        locationMap[merchantMID.locationId] || locationMap[String(merchantMID.locationId || '')]
      );
      if (!location) {
        results.push({
          midId: merchantMID.id,
          dbaName: merchantMID.dbaName,
          status: 'error',
          error: `Location ${merchantMID.locationId} not found`,
        });
        allSuccessful = false;
        continue;
      }

      try {
        // ── Step 1: Create draft application (skip if already has one, unless it was deleted) ────────
        let mspApplicationNo = merchantMID.mspApplicationNo;

        // If we have a stored application number, verify it still exists in MSP.
        // If it was deleted from the MSP dashboard, clear it so we create a fresh draft.
        if (mspApplicationNo) {
          const checkRes = await fetch(`${mspBase}/applications/${mspApplicationNo}`, { headers: mspHeaders });
          if (checkRes.status === 404) {
            console.warn(`[submitToMSP] Application ${mspApplicationNo} not found in MSP (deleted?) — will create a new draft for "${merchantMID.dbaName}"`);
            mspApplicationNo = null;
            await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { mspApplicationNo: null });
          } else {
            console.log(`[submitToMSP] Reusing existing draft ${mspApplicationNo} for "${merchantMID.dbaName}"`);
          }
        }

        if (!mspApplicationNo) {
          // Pick the template via pricingTier first (canonical); fall back to the
          // old pricingMethod-based cash-discount detection for any record that
          // only has pricingMethod set and no pricingTier.
          const tierKey = (merchantMID.pricingTier || profile.pricingTier || '').toUpperCase();
          const isCashDiscountByMethod = ['TIERD', 'CLEAR'].includes((merchantMID.pricingMethod || '').toUpperCase());
          const templateNo = Number(merchantMID.mspTemplateNo || profile.mspTemplateNo)
            || tierToTemplate(tierKey)
            || (isCashDiscountByMethod ? resolveCdTemplateNo() : resolveDefaultTemplateNo());
          const rawDba = merchantMID.dbaName || location.dbaName || profile.legalName || 'Merchant';
          const createBody = {
            dba: sanitizeDbaForMspCreate(rawDba),
            merchantapplicationtypeno: MSP_APP_TYPE,
            salespersonid: salespersonId,
            templatemerchantapplicationno: templateNo,
          };

          const createRes = await fetch(`${mspBase}/applications`, {
            method: 'POST',
            headers: mspHeaders,
            body: JSON.stringify(createBody),
          });
          const createData = await createRes.json().catch(() => ({ error: `non-JSON HTTP ${createRes.status}` }));

          if (!createRes.ok || createData.success === false || !(createData.merchantapplicationno ?? createData.MerchantApplicationNo)) {
            const tplDiag = await diagnoseMspTemplate(mspBase, mspHeaders, templateNo);
            console.error(`[submitToMSP] Failed to create application for "${merchantMID.dbaName}":`, JSON.stringify(createData), tplDiag);
            await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { applicationStepStatus: 'Error' });
            results.push({
              midId: merchantMID.id,
              locationId: merchantMID.locationId,
              dbaName: merchantMID.dbaName,
              status: 'error',
              error: `${createData.error || createData.message || `HTTP ${createRes.status}`} (template ${templateNo}). ${tplDiag}`,
              templateNo,
            });
            allSuccessful = false;
            continue;
          }

          mspApplicationNo = createData.merchantapplicationno ?? createData.MerchantApplicationNo;
          console.log(`[submitToMSP] Created application ${mspApplicationNo} for "${merchantMID.dbaName}"`);

          // Persist application number immediately so it's trackable even if form fill fails
          await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, {
            mspApplicationNo: String(mspApplicationNo),
            applicationStepStatus: 'In Review',
          });
        }

        // ── Step 2: Fill form ─────────────────────────────────────────────────
        const entityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
        const formPayload = buildFormPayload(profile, location, merchantMID, primarySigner, additionalSigners, entityMailing);
        console.log(`[submitToMSP] Filling form for application ${mspApplicationNo}:`, JSON.stringify(redactSensitive(formPayload), null, 2));

        const formRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/form`, {
          method: 'PUT',
          headers: mspHeaders,
          body: JSON.stringify(formPayload),
        });
        const formData = await formRes.json();
        console.log(`[submitToMSP] Form fill response ${formRes.status}:`, JSON.stringify(redactSensitive(formData), null, 2));

        // Per the actual MSPWare API spec (mspware-swagger.json), the PUT /form
        // response nests everything under `validation` — { validation: { errors:
        // { data, completion, rules }, percent_complete, messages, canSave, form } }.
        // This file previously read these off the top level of formData directly,
        // which meant percentComplete/validationErrors/messages were ALWAYS empty
        // regardless of what MSPWare actually reported — masking real validation
        // errors and silent field-clearing messages this whole time.
        const validation = formData?.validation || {};
        const percentComplete = validation?.percent_complete ?? null;
        const validationErrors = [
          ...(validation?.errors?.data || []),
          ...(validation?.errors?.completion || []),
          ...(validation?.errors?.rules || []),
        ];
        const mspMessages = validation?.messages || [];

        // Log form fill issues but don't abort — template defaults may cover remaining fields,
        // and signApplication will re-fill + verify completion before creating the signing package.
        if (!formRes.ok) {
          console.error(`[submitToMSP] Form PUT HTTP error ${formRes.status} for ${mspApplicationNo}:`, JSON.stringify(redactSensitive(formData)));
        } else {
          console.log(`[submitToMSP] Form fill ${mspApplicationNo}: ${percentComplete ?? '?'}% complete, canSave=${formData?.canSave}, errors=${validationErrors.length}`);
        }

        // ── Step 3: Submit (only if MSP_SUBMIT_ENABLED=true) ──────────────────
        if (!submitEnabled) {
          results.push({
            midId: merchantMID.id,
            locationId: merchantMID.locationId,
            dbaName: merchantMID.dbaName,
            status: 'draft_created',
            mspApplicationNo,
            percentComplete,
            validationErrors,
            mspMessages, // TEMP DIAGNOSTIC — see comment above
            note: 'Set MSP_SUBMIT_ENABLED=true to submit to Elavon',
          });
          continue;
        }

        const submitRes = await fetch(`${mspBase}/applications/${mspApplicationNo}/submit`, {
          method: 'PUT',
          headers: mspHeaders,
          body: JSON.stringify({}),
        });
        const submitData = await submitRes.json();
        console.log(`[submitToMSP] Submit response ${submitRes.status}:`, JSON.stringify(redactSensitive(submitData), null, 2));

        if (submitRes.ok && submitData?.success) {
          await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, {
            applicationStepStatus: 'Pending MID',
          });
          results.push({
            midId: merchantMID.id,
            locationId: merchantMID.locationId,
            dbaName: merchantMID.dbaName,
            status: 'submitted',
            mspApplicationNo,
            percentComplete,
          });
        } else {
          await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { applicationStepStatus: 'Error' });
          results.push({
            midId: merchantMID.id,
            locationId: merchantMID.locationId,
            dbaName: merchantMID.dbaName,
            status: 'submit_error',
            mspApplicationNo,
            error: submitData?.error || submitData?.message || `HTTP ${submitRes.status}`,
            rawSubmitResponse: submitData,
          });
          allSuccessful = false;
        }

      } catch (err: any) {
        console.error(`[submitToMSP] Exception for "${merchantMID.dbaName}":`, err.message);
        await base44.asServiceRole.entities.MerchantMID.update(merchantMID.id, { applicationStepStatus: 'Error' });
        results.push({
          midId: merchantMID.id,
          locationId: merchantMID.locationId,
          dbaName: merchantMID.dbaName,
          status: 'error',
          error: err.message,
        });
        allSuccessful = false;
      }
    }

    return Response.json({
      success: allSuccessful,
      allSubmitted: allSuccessful && results.every(r => ['submitted', 'skipped', 'draft_created'].includes(r.status)),
      submitEnabled,
      corporateId,
      merchantMIDsAutoCreated: merchantMIDsCreatedAuto,
      results,
    });

  } catch (error: any) {
    return Response.json({ error: error.message, stack: error.stack?.split('\n').slice(0, 3).join(' | ') }, { status: 500 });
  }
});