import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
function sanitizeState(s: string): string { const c = (s||'').toUpperCase().trim(); return US_STATES.has(c) ? c : ''; }
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

function buildFormPayload(profile: any, location: any, merchantMID: any, signer: any, additionalSigners: any[], entityMailing?: any): Record<string, unknown> {
  const bank = merchantMID.bankDetails || location.bankDetails || {};
  const routing = bank.routingNumber || location.routingNumber || '';
  const account = bank.accountNumber || location.accountNumber || '';
  const taxId = cleanDigits(profile.taxId || '');
  const ssn = cleanDigits(signer?.ssn || profile.ssn || '');
  const phone = cleanDigits(signer?.corporatePhone || profile.corporatePhone || '');
  const pricingCategory = String(merchantMID.pricingCategory || '1');
  const TIER_TO_METHOD: Record<string, string> = { 'TRADITIONAL': 'ICPLS', 'STANDARD': 'ICPLS', 'PREMIUM': 'ICPLS', 'CASH_DISCOUNT': 'CLEAR' };
  const rawPricingMethod = merchantMID.pricingMethod || profile.pricingMethod || TIER_TO_METHOD[(profile.pricingTier||'').toUpperCase()] || 'ICPLS';
  const pricingMethod = rawPricingMethod.toUpperCase() === 'CASH_DISCOUNT' ? 'CLEAR' : rawPricingMethod;
  const industryType = (merchantMID.pricingCategory && merchantMID.industryType) ? merchantMID.industryType : mapIndustryType(pricingCategory);
  const mcc = merchantMID.mccCode || profile.mccCode || '5999';
  const dbaName = merchantMID.dbaName || location.dbaName || profile.legalName || '';
  const monthlyCardSales = Math.max(1, parseFloat(String(merchantMID.monthlyCardSales || profile.monthlyCardSales || '6000')) || 6000);
  const cap = Math.max(monthlyCardSales - 1, 1);
  const avgSaleAmount = String(Math.min(parseFloat(String(merchantMID.avgSaleAmount || profile.avgSaleAmount || '100')) || 100, cap));
  const highestTicketAmount = String(Math.min(parseFloat(String(merchantMID.highestTicketAmount || profile.highestTicketAmount || '200')) || 200, cap));
  const deliveryDelayDays = String(Math.max(parseInt(String(merchantMID.deliveryDelayDays ?? '0'), 10), 1));
  const rawCpPct = merchantMID.cardPresentPct != null ? merchantMID.cardPresentPct : 100;
  const cardPresentPct = Math.max(0, Math.min(100, parseInt(String(rawCpPct), 10) || 100));
  const cnpPct = 100 - cardPresentPct;
  const intPct = cnpPct > 0 ? String(profile.internetPct ?? 0) : '0';
  const motoPct = cnpPct > 0 ? String(profile.motoPct ?? Math.max(0, cnpPct - parseInt(intPct, 10))) : '0';
  const ownershipRaw = profile.ownershipType || profile.taxClassType || '';
  const ownershipType = mapOwnershipType(ownershipRaw);
  const isLLC = ownershipType === 'LL';
  const annualRevenue = String(profile.annualRevenue || (monthlyCardSales * 12));

  return {
    full_dba_name: dbaName,
    legal_dba_name: profile.legalName || '',
    products_or_services: profile.productDescription || 'Retail goods and services',
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
    business_address: location.businessStreet || location.businessAddress || '',
    business_city: location.businessCity || '',
    business_state_usa: location.businessState || '',
    business_zipcode: location.businessZip || '',
    ...(entityMailing?.street ? {
      has_legal_address: 'mailing',
      mailing_address_type: 'LGA',
      mailing_address: entityMailing.street,
      mailing_city: entityMailing.city,
      mailing_state_usa: sanitizeState(entityMailing.state),
      mailing_zipcode: entityMailing.zip,
    } : { has_legal_address: 'business' }),
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
        owner_address: signer?.homeStreet || profile.homeStreet || '',
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
        owner_address: s.homeStreet || '',
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
    cp_percent: String(cardPresentPct),
    cnp_percent: String(cnpPct),
    int_percent: intPct,
    moto_percent: motoPct,
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
    state_of_formation: location.businessState || profile.stateOfFormation || '',
    currently_processing: profile.currentlyProcessing ? 'Y' : 'N',
    seasonal_business: profile.isSeasonal ? 'Y' : 'N',
    refund_policy: profile.refundPolicy || 'R',
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
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
    for (const ent of (profile.legalEntities || [])) {
      if (ent.entityId && ent.mailingStreet) entityMailingMap[ent.entityId] = { street: ent.mailingStreet, city: ent.mailingCity, state: ent.mailingState, zip: ent.mailingZip || '' };
    }

    const results: any[] = [];
    for (const appNo of applicationNos) {
      const merchantMID = allMerchantMIDs?.find((c: any) => String(c.mspApplicationNo) === String(appNo));
      if (!merchantMID) { results.push({ appNo, error: 'MerchantMID not found' }); continue; }
      const location = resolveLocationAddress(locationMap[merchantMID.locationId] || {});
      const entityMailing = location.entityId ? (entityMailingMap[location.entityId] || null) : null;
      const payload = buildFormPayload(profile, location, merchantMID, primarySigner, additionalSigners, entityMailing);

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