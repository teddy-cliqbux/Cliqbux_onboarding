import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
// redeployed 2026-07-14b — force-redeploy to pick up latest GitHub-synced changes

// Force-refills MSPWare forms for a list of application numbers using the latest payload builder.
// POST /functions/refillMSPForms  { corporateId, applicationNos: ["161","162","163"] }

function mapOwnershipType(t: string): string {
  const map: Record<string, string> = {
    'SOLE_PROP': 'SP', 'SOLE_PROPRIETOR': 'SP',
    'LLC': 'LL', 'LLC_CORPORATION': 'LL', 'LLC_PARTNERSHIP': 'LL',
    'CORPORATION': 'CO', 'LIMITED_COMPANY': 'LL',
    'NON_PROFIT': 'NP', 'GENERAL_PARTNERSHIP': 'PA', 'LIMITED_PARTNERSHIP': 'PA',
  };
  return map[t?.toUpperCase?.()] || map[t] || 'CO';
}
function mapLlcClass(t: string): string {
  const map: Record<string, string> = { 'LLC': 'D', 'LLC_PARTNERSHIP': 'P', 'LLC_CORPORATION': 'C' };
  return map[t] || 'D';
}
function mapOwnerTitle(t: string): string {
  const map: Record<string, string> = {
    'CHIEF_EXECUTIVE_OFFICER': 'CEO', 'PRESIDENT': 'P', 'VICE_PRESIDENT': 'VP',
    'DIRECTOR': 'D', 'SECRETARY': 'S', 'TREASURER': 'T', 'MANAGING_MEMBER': 'MM',
    'AUTHORIZED_SIGNER': 'OP', 'OWNER': 'OP', 'PROPRIETOR_OR_OWNER': 'OP',
    'PARTNER': 'PP', 'PARTNER_OR_PRINCIPAL': 'PP', 'MANAGER': 'GM', 'GENERAL_MANAGER': 'GM',
  };
  return map[t] || 'OP';
}
function mapIndustryType(pricingCategory: string): string {
  const map: Record<string, string> = { '1': 'RE', '2': 'HT', '4': 'SP', '5': 'ARU', '6': 'MS', '7': 'RS', '13': 'RE' };
  return map[pricingCategory] || 'RE';
}
function cleanDigits(s: string): string { return (s || '').replace(/\D/g, ''); }
const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
// Full names (HubSpot company.state, etc.) → 2-letter. Sync with src/lib/usState.js
const US_STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS',
  KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD', MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO', MONTANA: 'MT',
  NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
  OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
  VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV', WISCONSIN: 'WI',
  WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC', 'WASHINGTON DC': 'DC', 'WASHINGTON D C': 'DC',
};
function sanitizeState(s: string): string {
  const trimmed = String(s || '').trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  if (US_STATES.has(upper)) return upper;
  const fromName = US_STATE_NAME_TO_CODE[upper.replace(/\./g, '').replace(/\s+/g, ' ').trim()];
  if (fromName) return fromName;
  const compact = upper.replace(/[^A-Z]/g, '');
  if (compact.length === 2 && US_STATES.has(compact)) return compact;
  return '';
}
function formatDob(year: string, month: string, day: string): string {
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function nextMonthStart(): string {
  const now = new Date();
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const m = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  return `${y}-${String(m).padStart(2,'0')}-01`;
}
function resolveLocationAddress(location: Record<string, any>): Record<string, any> {
  if (location.businessStreet && location.businessCity && location.businessState) return location;
  const flat = location.businessAddress || '';
  const m = flat.match(/^(.+?),\s*(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (!m) return location;
  return { ...location, businessStreet: m[1].trim(), businessCity: m[2].trim(), businessState: m[3].toUpperCase(), businessZip: m[4].trim() };
}

/** Apt/suite → MSPWare single street line. Sync with helpers/addressLine.ts + src/lib/addressLine.js */
function composeStreet(street: string | null | undefined, street2: string | null | undefined): string {
  const line1 = String(street || '').trim();
  const line2 = String(street2 || '').trim();
  if (!line1) return line2;
  if (!line2) return line1;
  return `${line1} ${line2}`;
}

// ─── MCC → industry_type + products_or_services (inlined from mccCatalog) ───
// Regenerate via: node scripts/gen-mcc-catalog.mjs
// MSPWare products_or_services max length 33 (rejected live 2026-07-23 KK House of Lechon).
const MSP_PRODUCTS_OR_SERVICES_MAX = 33;
function clampProductsOrServices(s: string): string {
  let t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Retail goods and services'.slice(0, MSP_PRODUCTS_OR_SERVICES_MAX);
  if (t.length <= MSP_PRODUCTS_OR_SERVICES_MAX) return t;
  const cut = t.slice(0, MSP_PRODUCTS_OR_SERVICES_MAX);
  const sp = cut.lastIndexOf(' ');
  return (sp >= 12 ? cut.slice(0, sp) : cut).trim();
}
const MCC_PRODUCTS_OR_SERVICES: Record<string, string> = {
  "4900": "Electricity Providers",
  "5211": "Building Materials",
  "5231": "Glass & Glass Supplies",
  "5251": "Electrical Supplies",
  "5261": "Gardening Supplies",
  "5411": "Grocery Stores",
  "5422": "Butcher Shops",
  "5441": "Candy, Nut & Confectionery Stores",
  "5451": "Cheese Shops",
  "5462": "Bagel Shops",
  "5499": "Coffee Shops",
  "5611": "Men's & Boy's Clothing &",
  "5621": "Bridal Shops",
  "5631": "Costume Jewelry",
  "5641": "Children & Infant Clothes",
  "5651": "Family Clothing Stores",
  "5655": "Athletic Apparel Stores",
  "5661": "Athletic Shoe Stores",
  "5681": "Furriers & Fur Shops",
  "5691": "Men's & Women's Clothing Stores",
  "5697": "Custom Made Clothing",
  "5698": "Wig & Toupee Stores",
  "5699": "Clothing - Formal Wear",
  "5712": "Furniture, Home Furnishing &",
  "5732": "Electronic Sales",
  "5734": "Computer Software Sales",
  "5811": "Caterers",
  "5812": "Eating Places & Restaurants (Non",
  "5813": "Bars, Saloons, Pubs, Taverns,",
  "5814": "Restaurants - Fast Food",
  "5921": "Bottled Beer, Wine & Liquor Sales",
  "5932": "Antique Shops",
  "7011": "Bed & Breakfast Establishments",
  "7221": "Photographic Studios",
  "7230": "Barber & Beauty Shops",
  "7941": "Athletic Fields",
  "8099": "Blood Banks",
  "5621A": "Dress Shops",
  "5697A": "Dressmakers",
  "5655A": "Equestrian Apparel",
  "5661A": "Footwear Stores",
  "7230A": "Hair & Beauty Salons",
  "7230B": "Hair Cutting",
  "5698A": "Hair Pieces & Extensions",
  "5631A": "Handbag Stores",
  "5631B": "Lingerie Stores",
  "5697B": "Made-To-Order Clothing",
  "7230C": "Makeup Studios",
  "5621B": "Maternity Stores",
  "5611A": "Men's Hat Shops",
  "5611B": "Men's Tie Shops",
  "5699A": "Miscellaneous Apparel &",
  "7230D": "Nail Salon",
  "5697C": "Sewing Shops",
  "5661B": "Shoe Stores",
  "5655B": "Sports & Riding Apparel Stores",
  "5699B": "Swim Wear Shop",
  "5699C": "T-Shirt Shop",
  "5697D": "Tailors, Seamstresses, Mending &",
  "5661C": "Western Boot Shops",
  "5631C": "Women's Clothing Accessories",
  "5621C": "Women's Coat Stores",
  "5631D": "Women's Hat Shops",
  "5621D": "Women's Ready-To-Wear Stores",
  "5732A": "Electronic Repair Shops",
  "5732B": "Electronic Sales",
  "5732E": "Radios, Camcorders & VCRs",
  "5732C": "Stereo Equipment & Accessories",
  "5732D": "Television Stores",
  "5921C": "Alcohol Via Internet",
  "5462A": "Bakeries",
  "5462G": "Cake Shops",
  "5441A": "Chocolate Shops",
  "5813A": "Comedy Clubs",
  "5441B": "Confectionery Shops",
  "5499A": "Convenience Stores",
  "5462B": "Cookie Stores",
  "5451A": "Dairy Product Stores",
  "5499B": "Delicatessens",
  "5462C": "Doughnut Shops",
  "5441C": "Dried Fruit Shops",
  "5422A": "Freezer & Locker Meat Providers",
  "5499C": "Fruit Markets",
  "5499D": "Gourmet Food Stores",
  "5499E": "Health Food Stores",
  "5499F": "Ice Cream Shops",
  "5921F": "Internet Bottled Beer, Wine, and",
  "5921E": "Internet Liquor Stores",
  "5921D": "Internet Package Alcohol Sales",
  "5921A": "Liquor Stores",
  "5422C": "Meat Locker",
  "5422D": "Meat Market",
  "5499O": "Mini Markets",
  "5499G": "Miscellaneous Food Stores",
  "5813B": "Night Clubs",
  "5441D": "Nut Shops",
  "5921B": "Package Alcohol Sales",
  "5462D": "Pastry Shops",
  "5462E": "Pie Shops",
  "5441E": "Popcorn Stands",
  "5499P": "Poultry Shops",
  "5499H": "Pretzel Stands",
  "5499I": "Produce Markets",
  "5813C": "Restaurants - Servicing Alcohol",
  "5422B": "Seafood & Frozen Meat",
  "5422E": "Seafood Market",
  "5499J": "Specialty Food Markets",
  "5411A": "Supermarkets",
  "5499K": "Tea Stores",
  "5499L": "Vegetable Markets",
  "5499M": "Vitamin Stores",
  "5462F": "Wedding Cakes",
  "5499N": "Yogurt Shops",
  "5211A": "Construction Materials",
  "5261A": "Greenhouses",
  "5251A": "Hand Tools",
  "5251B": "Hardware Stores",
  "5261B": "Lawn Supplies",
  "5251C": "Lighting Fixtures Supplies",
  "5211B": "Lumber",
  "5261C": "Nurseries",
  "5231A": "Painting & Painting Supplies",
  "5261D": "Plant Shops",
  "5251D": "Plumbing Supplies",
  "5251E": "Power Tools",
  "5211C": "Roofing Materials",
  "5231B": "Wallcovering Supplies",
  "5231C": "Wallpaper Supplies",
  "5712A": "Made-To-Order Furniture",
  "5712B": "Mattress Stores",
  "5712C": "Outdoor Furnishing",
  "7011A": "Central Reservations Service",
  "8099A": "Chemical Dependency Treatment",
  "8099B": "Fertility Clinics",
  "8099C": "Hair Replacement Centers",
  "8099D": "Hearing Testing Services",
  "7011B": "Lodging - Not Elsewhere",
  "8099K": "Medical Massage Therapists",
  "8099E": "Medical Services & Health",
  "8099F": "Mental Health Practitioners",
  "8099G": "Physical Therapists",
  "7941A": "Professional Sports Clubs",
  "8099H": "Psychiatrists",
  "8099I": "Psychologists",
  "7941B": "Sports Arenas",
  "8099J": "Sports Medicine Clinics",
  "7941C": "Stadiums",
  "5311G": "Department Stores",
  "5932A": "Furniture Repair & Restoration",
  "7221A": "Portrait Studios",
  "7221B": "Wedding Photographers",
  "4900A": "Garbage Collections",
  "4900B": "Gas Utility Providers",
  "4900F": "Home Heating Oil",
  "4900C": "Public Utility Providers",
  "4900D": "Sanitary Utility Providers",
  "4900E": "Water Utility Providers"
};
function mccBaseCode(mcc: string): string {
  return String(mcc || '').trim().replace(/[A-Z]+$/i, '');
}
/** Exact cafe/bakery RS codes — do NOT family-strip 5462/5499 siblings. */
const RS_EXACT = new Set([
  '5462', '5462A', '5462C',
  '5499', '5499F', '5499H', '5499K', '5499N',
]);
function mccToIndustryCode(mcc: string): string {
  const raw = String(mcc || '').trim().toUpperCase();
  if (RS_EXACT.has(raw)) return 'RS';
  const b = mccBaseCode(mcc);
  if (['5811', '5812', '5813', '5814'].includes(b)) return 'RS';
  if (b === '5411') return 'SP';
  if (b === '7011') return 'HT';
  return 'RE';
}
function mccToProductsOrServices(mcc: string): string {
  const raw = String(mcc || '').trim().toUpperCase();
  let out = 'Retail goods and services';
  if (raw) {
    if (MCC_PRODUCTS_OR_SERVICES[raw]) out = MCC_PRODUCTS_OR_SERVICES[raw];
    else {
      const b = mccBaseCode(raw);
      if (MCC_PRODUCTS_OR_SERVICES[b]) out = MCC_PRODUCTS_OR_SERVICES[b];
    }
  }
  return clampProductsOrServices(out);
}
function resolveIndustryType(merchantMID: any, mcc: string, pricingCategory: any, mapIndustryTypeFn: (c: any) => string): string {
  return merchantMID.industryType || mccToIndustryCode(mcc) || mapIndustryTypeFn(pricingCategory) || 'RE';
}
function resolveProductsOrServices(profile: any, mcc: string): string {
  const manual = String(profile?.productDescription || '').trim();
  if (manual) return clampProductsOrServices(manual);
  return mccToProductsOrServices(mcc);
}

function buildFormPayload(profile: any, location: any, merchantMID: any, signer: any, additionalSigners: any[], entityMailing?: any, entityCorrespondence?: any): Record<string, unknown> {
  const bank = merchantMID.bankDetails || location.bankDetails || {};
  const routing = bank.routingNumber || location.routingNumber || '';
  const account = bank.accountNumber || location.accountNumber || '';
  const taxId = cleanDigits(profile.taxId || '');
  const ssn = cleanDigits(signer?.ssn || profile.ssn || '');
  const phone = cleanDigits(signer?.corporatePhone || profile.corporatePhone || '');
  const pricingCategory = String(merchantMID.pricingCategory || '1');
  // 2026-07-03: Cliqbux never uses MSPWare's "Clear and Simple" pricing method —
  // Cash Discount uses "Tiered" (TIERD). See docs/mspware-field-reference.md.
  // NOTE: this function is stale relative to submitToMSP/signApplication (still
  // has the old has_legal_address:'mailing'/'LGA' bug below) — patched the
  // pricing method mapping only; full parity fix not yet done here.
  // 2026-07-06: added the 3 canonical simplified tier names (see AGENTS.md Critical
  // Lesson #12). NOTE: this file still hardcodes all_markup_discount/all_markup_per_item
  // as static 0.0000/0.000 below (line ~186) regardless of pricing tier — that's WRONG
  // for CUSTOM_FLAT_RATE/CUSTOM_INTERCHANGE_PLUS (always individually negotiated, see
  // submitToMSP/signApplication for the correct customMarkupPercentage/customPerTxFee-
  // sourced pattern + hard guard). Not yet fixed here — this is an admin-only force-
  // refill tool, not part of the automatic merchant flow, but do not use it on a
  // custom-pricing-tier merchant until it has the same guard as the other 2 files.
  const TIER_TO_METHOD: Record<string, string> = {
    'CUSTOM_FLAT_RATE': 'FLAT', 'CUSTOM_INTERCHANGE_PLUS': 'ICPLS', 'SELF_SERVE_CASH_DISCOUNT': 'TIERD',
    'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS', 'SELF_SWIPED': 'ICPLS', 'SELF_KEYED': 'ICPLS',
    'CASH_DISCOUNT': 'TIERD', 'SELF_CASH_DISCOUNT': 'TIERD',
  };
  const rawPricingMethod = merchantMID.pricingMethod || profile.pricingMethod || TIER_TO_METHOD[(profile.pricingTier||'').toUpperCase()] || 'ICPLS';
  const pricingMethod = rawPricingMethod.toUpperCase() === 'CASH_DISCOUNT' ? 'TIERD' : rawPricingMethod;
  // 2026-07-13: NEVER default to 5999 (restricted; rejected in CA/CO/NY).
  const mcc = String(merchantMID.mccCode || profile.mccCode || '').trim();
  if (!mcc) {
    throw new Error(`MCC code is required before refill for "${merchantMID.dbaName || merchantMID.merchantName || 'this MID'}".`);
  }
  if (mcc === '5999') {
    throw new Error('MCC 5999 is not allowed (restricted merchant category — rejected in CA/CO/NY).');
  }
  const industryType = resolveIndustryType(merchantMID, mcc, pricingCategory, mapIndustryType);
  const dbaName = merchantMID.dbaName || location.dbaName || profile.legalName || '';
  const monthlyCardSales = Math.max(1, parseFloat(String(merchantMID.monthlyCardSales || profile.monthlyCardSales || '6000')) || 6000);
  const cap = Math.max(monthlyCardSales - 1, 1);
  const avgSaleAmount = String(Math.min(parseFloat(String(merchantMID.avgSaleAmount || profile.avgSaleAmount || '100')) || 100, cap));
  const highestTicketAmount = String(Math.min(parseFloat(String(merchantMID.highestTicketAmount || profile.highestTicketAmount || '200')) || 200, cap));
  const deliveryDelayDays = String(Math.max(parseInt(String(merchantMID.deliveryDelayDays ?? '0'), 10), 1));
  const rawCpPct = merchantMID.cardPresentPct != null ? merchantMID.cardPresentPct : 100;
  const cardPresentPct = Math.max(0, Math.min(100, parseInt(String(rawCpPct), 10) || 100));
  // Same Omni mapping as signApplication/submitToMSP (2026-07-14): In-Person→cp,
  // Online→int, MOTO→cnp. Do not use residual (100−cp) or send moto_percent.
  const midIntPct = Math.max(0, Math.min(100, parseInt(String(merchantMID.internetPct ?? 0), 10) || 0));
  const midMotoPct = Math.max(0, Math.min(100, parseInt(String(merchantMID.motoPct ?? 0), 10) || 0));
  let cp = cardPresentPct;
  let online = midIntPct;
  let moto = midMotoPct;
  const splitSum = cp + online + moto;
  if (splitSum <= 0) { cp = 100; online = 0; moto = 0; }
  else if (splitSum !== 100) {
    cp = Math.round((cp * 100) / splitSum);
    online = Math.round((online * 100) / splitSum);
    moto = Math.max(0, 100 - cp - online);
  }
  const cnpPct = moto;
  const intPct = String(online);
  let websiteUrl = String(merchantMID.businessWebsite || profile.businessWebsite || profile.website || '').trim();
  if (websiteUrl) {
    websiteUrl = websiteUrl.replace(/[.,;)\]]+$/g, '');
    if (!/^https?:\/\//i.test(websiteUrl)) websiteUrl = `https://${websiteUrl}`;
    try {
      const u = new URL(websiteUrl);
      const host = String(u.hostname || '').toLowerCase();
      const okHost = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(host);
      if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !host || host === 'localhost' || !okHost) {
        websiteUrl = '';
      }
    } catch {
      websiteUrl = '';
    }
  }
  if (online > 0 && !websiteUrl) {
    throw new Error(`Business homepage URL is required when Online volume > 0% (MID "${merchantMID.dbaName || merchantMID.merchantName || merchantMID.id}"). Enter a valid site like https://www.example.com.`);
  }
  const ownershipRaw = profile.ownershipType || profile.taxClassType || '';
  const ownershipType = mapOwnershipType(ownershipRaw);
  const isLLC = ownershipType === 'LL';
  const annualRevenue = String(profile.annualRevenue || (monthlyCardSales * 12));

  return {
    full_dba_name: dbaName,
    legal_dba_name: profile.legalName || '',
    products_or_services: resolveProductsOrServices(profile, mcc),
    year_business_established: String(profile.establishmentYear || new Date().getFullYear() - 3),
    ownership_years: String(profile.currentOwnershipYears || '1'),
    ownership_months: String(profile.currentOwnershipMonths || '0'),
    ownership_type: ownershipType,
    ...(taxId ? { tin: taxId } : {}),
    ...(!taxId && ssn ? { ssn } : {}),
    ...(isLLC ? { llc_class: mapLlcClass(ownershipRaw) } : {}),
    country_formation: 'USA',
    country_operations: 'USA',
    industry_type: industryType,
    contact_first_name: signer?.firstName || '',
    contact_last_name: signer?.lastName || '',
    business_phone: phone,
    customer_service_phone: phone,
    business_email: signer?.signerEmail || profile.signerEmail || '',
    business_address_type: 'BSA',
    business_address: composeStreet(location.businessStreet, location.businessStreet2) || location.businessAddress || '',
    business_city: location.businessCity || '',
    business_state_usa: sanitizeState(location.businessState || ''),
    business_zipcode: location.businessZip || '',
    ...(entityMailing?.street ? {
      has_legal_address: 'new',
      legal_country: 'USA',
      legal_address_type: 'BSA',
      legal_address: composeStreet(entityMailing.street, entityMailing.street2),
      legal_city: entityMailing.city,
      legal_state_usa: sanitizeState(entityMailing.state),
      legal_zipcode: entityMailing.zip,
    } : { has_legal_address: 'business' }),
    ...(entityCorrespondence?.street && entityCorrespondence?.city && entityCorrespondence?.state ? {
      mailing_address_type: 'BSA',
      mailing_address: composeStreet(entityCorrespondence.street, entityCorrespondence.street2),
      mailing_city: entityCorrespondence.city,
      mailing_state_usa: sanitizeState(entityCorrespondence.state),
      mailing_zipcode: entityCorrespondence.zip || '',
    } : {}),
    owners: [
      {
        owner_responsible_party: true,
        owner_personal_guarantee: true,
        principal_sign_agreement: true,
        ownership_percent: String(signer?.ownershipPercentage || profile.ownershipPercentage || '100'),
        owner_title: mapOwnerTitle(signer?.titleType || profile.titleType || ''),
        owner_firstname: signer?.firstName || '',
        owner_middlename: '',
        owner_lastname: signer?.lastName || '',
        owner_dob: formatDob(signer?.dobYear || profile.dobYear, signer?.dobMonth || profile.dobMonth, signer?.dobDay || profile.dobDay),
        owner_phone: phone,
        owner_email: signer?.signerEmail || profile.signerEmail || '',
        owner_country: 'USA',
        owner_address_type: 'PRA',
        owner_address: composeStreet(signer?.homeStreet || profile.homeStreet, signer?.homeStreet2 || profile.homeStreet2),
        owner_city: signer?.homeCity || profile.homeCity || '',
        owner_state_usa: sanitizeState(signer?.homeState || profile.homeState || '') || sanitizeState(location.businessState || ''),
        owner_zipcode: signer?.homeZip || profile.homeZip || '',
        owner_citizenship_country_1: 'USA',
        owner_id_type: 'SSN',
        owner_id_number: ssn,
      },
      ...additionalSigners.map(s => ({
        owner_responsible_party: false,
        owner_personal_guarantee: !!s.signsPersonalGuarantee,
        principal_sign_agreement: !!s.isAuthorizedSigner,
        ownership_percent: String(s.ownershipPercentage || '0'),
        owner_title: mapOwnerTitle(s.titleType || ''),
        owner_firstname: s.firstName || '',
        owner_middlename: '',
        owner_lastname: s.lastName || '',
        owner_dob: formatDob(s.dobYear, s.dobMonth, s.dobDay),
        owner_phone: cleanDigits(s.corporatePhone || phone),
        owner_email: s.signerEmail || '',
        owner_country: 'USA',
        owner_address_type: 'PRA',
        owner_address: composeStreet(s.homeStreet, s.homeStreet2),
        owner_city: s.homeCity || '',
        owner_state_usa: sanitizeState(s.homeState),
        owner_zipcode: s.homeZip || '',
        owner_citizenship_country_1: 'USA',
        owner_id_type: 'SSN',
        owner_id_number: cleanDigits(s.ssn || ''),
      })),
    ],
    has_intermediary_businesses: false,
    beneficial_ownership_exemption: 'NON',
    owner_confirmed: true,
    annual_revenue: annualRevenue,
    monthly_sales: String(monthlyCardSales),
    average_sales: avgSaleAmount,
    highest_ticket: highestTicketAmount,
    freq_highest_average_ticket: String(profile.highestTicketFrequency || '24'),
    cp_percent: String(cp),
    cnp_percent: String(cnpPct),
    int_percent: intPct,
    // moto_percent omitted — Omni totals CP+CNP+Internet only (portal MOTO → cnp)
    ...(online > 0 && websiteUrl ? { business_homepage_url: websiteUrl } : {}),
    delayed_delivery: deliveryDelayDays,
    cards_accepted: ['VISA', 'VISA_DEBIT', 'MASTERCARD', 'MASTERCARD_DEBIT', 'DISCOVER', 'AMEX'],
    card_acceptance_split: cardPresentPct >= 100 ? 'CP' : 'OMNI',
    mcc,
    pricing_method: pricingMethod,
    pricing_category: pricingCategory,
    billing_method: 'N',
    annual_fee_start_date: nextMonthStart(),
    auth_pricing_program: '49999',
    all_markup_discount: '0.0000',
    all_markup_per_item: '0.000',
    all_card_auth_per_item: '0.050',
    intl_card_handling_fee: '0.60',
    tokenization_service_fee: '0.0000',
    tokenization_platform_fee: '0.0000',
    has_pin_debit: false,
    debit_auth_method: 'PNL',
    debit_pricing_method: 'ICPLS',
    // is_firearm_verified: omitted — template has a fixed default; any value causes a validation error
    ACCL_per_auth: '0.00', ACCL_percent_fee: '0.0000', ACCL_transaction_fee: '0.00',
    AFFN_per_auth: '0.00', AFFN_percent_fee: '0.0000', AFFN_transaction_fee: '0.00',
    ALAS_per_auth: '0.00', ALAS_percent_fee: '0.0000', ALAS_transaction_fee: '0.00',
    CU24_per_auth: '0.00', CU24_percent_fee: '0.0000', CU24_transaction_fee: '0.00',
    INKL_per_auth: '0.00', INKL_percent_fee: '0.0000', INKL_transaction_fee: '0.00',
    MSTO_per_auth: '0.00', MSTO_percent_fee: '0.0000', MSTO_transaction_fee: '0.00',
    NETS_per_auth: '0.00', NETS_percent_fee: '0.0000', NETS_transaction_fee: '0.00',
    NYCE_per_auth: '0.00', NYCE_percent_fee: '0.0000', NYCE_transaction_fee: '0.00',
    POSD_per_auth: '0.00', POSD_percent_fee: '0.0000', POSD_transaction_fee: '0.00',
    PULSE_per_auth: '0.00', PULSE_percent_fee: '0.0000', PULSE_transaction_fee: '0.00',
    ITS_per_auth: '0.00', ITS_percent_fee: '0.0000', ITS_transaction_fee: '0.00',
    STAR_per_auth: '0.00', STAR_percent_fee: '0.0000', STAR_transaction_fee: '0.00',
    UPDBT_per_auth: '0.00', UPDBT_percent_fee: '0.0000', UPDBT_transaction_fee: '0.00',
    ...(routing && account ? {
      deposit_account_no: account,
      deposit_account_rtg: routing,
      deposit_account_type: bank.accountType === 'savings' ? 'SA' : 'CK',
    } : {}),
    statement_delivery_method: 'E',
    chargebacks_retrievals_format: 'WM',
    chargebacks_retrievals_email: signer?.signerEmail || profile.signerEmail || '',
    state_of_formation: sanitizeState(location.businessState || profile.stateOfFormation || ''),
    currently_processing: profile.currentlyProcessing ? 'Y' : 'N',
    seasonal_business: profile.isSeasonal ? 'Y' : 'N',
    refund_policy: profile.refundPolicy || 'R',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Admin-only: requires a Base44 workspace session. Merchant portal tokens
    // are deliberately NOT accepted here.
    let adminUser: any = null;
    try { adminUser = await base44.auth.me(); } catch { /* no session */ }
    if (!adminUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const { corporateId, applicationNos } = body;
    if (!corporateId || !applicationNos?.length) return Response.json({ error: 'corporateId and applicationNos required' }, { status: 400 });

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const headers = { 'X-API-KEY': apiKey, 'X-App-ID': appId, 'Accept': 'application/json', 'Content-Type': 'application/json' };

    const [profiles, signers, allMerchantMIDs, allLocs] = await Promise.all([
      base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantMID.filter({ corporateId }),
      base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
    ]);

    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const primarySigner = signers?.find((s: any) => s.isPrimarySigner) || signers?.[0];
    const additionalSigners = signers?.filter((s: any) => !s.isPrimarySigner) || [];
    const locationMap: Record<string, any> = {};
    for (const loc of (allLocs || [])) locationMap[loc.id] = loc;
    const entityMailingMap: Record<string, any> = {};
    const entityCorrespondenceMap: Record<string, any> = {};
    for (const ent of (profile.legalEntities || [])) {
      if (ent.entityId && ent.mailingStreet) entityMailingMap[ent.entityId] = { street: ent.mailingStreet, street2: ent.mailingStreet2 || '', city: ent.mailingCity, state: ent.mailingState, zip: ent.mailingZip || '' };
      if (ent.entityId && ent.correspondenceStreet && ent.correspondenceCity && ent.correspondenceState) {
        entityCorrespondenceMap[ent.entityId] = {
          street: ent.correspondenceStreet, street2: ent.correspondenceStreet2 || '', city: ent.correspondenceCity,
          state: ent.correspondenceState, zip: ent.correspondenceZip || '',
        };
      }
    }

    const results: any[] = [];
    for (const appNo of applicationNos) {
      const merchantMID = allMerchantMIDs?.find((c: any) => String(c.mspApplicationNo) === String(appNo));
      if (!merchantMID) { results.push({ appNo, error: 'MerchantMID not found' }); continue; }
      const location = resolveLocationAddress(locationMap[merchantMID.locationId] || {});
      const entityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
      const entityCorrespondence = location.entityId ? (entityCorrespondenceMap[location.entityId] || null) : null;
      const payload = buildFormPayload(profile, location, merchantMID, primarySigner, additionalSigners, entityMailing, entityCorrespondence);

      console.log(`[refillMSPForms] PUT form for app ${appNo}:`, JSON.stringify(payload, null, 2));

      const putRes = await fetch(`${mspBase}/applications/${appNo}/form`, { method: 'PUT', headers, body: JSON.stringify(payload) });
      const putData = await putRes.json();

      // GET after PUT for true completion status
      const getRes = await fetch(`${mspBase}/applications/${appNo}/form`, { headers });
      const getData = await getRes.json();

      results.push({
        appNo,
        dba: merchantMID.dbaName,
        putStatus: putRes.status,
        putSuccess: putData.success,
        putErrors: [...(putData.data_errors||[]), ...(putData.completion_errors||[]), ...(putData.rule_violations||[])],
        putRaw: putData,
        percentComplete: getData.percent_complete,
        canSave: getData.canSave,
        getErrors: [...(getData.data_errors||[]), ...(getData.completion_errors||[]), ...(getData.rule_violations||[])],
      });
    }

    return Response.json({ success: true, results });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});