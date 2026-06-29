import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── manageMSPTemplate ────────────────────────────────────────────────────────
// Admin function for reading and populating MSPWare template applications.
//
// Actions:
//   read            — GET /applications/{no}/form → returns raw field values + completion %
//   fill_icpls      — Fill template #6 with all static ICPLS (interchange plus) fields
//   fill_cd         — Fill a template with all static Cash Discount fields
//   create_cd       — Create a new template application and fill it with Cash Discount fields
//   list            — List all template applications in the account
//
// POST /functions/manageMSPTemplate
// Body: { action, templateNo? }

const MSP_APP_TYPE   = 24;  // Elavon US Application
const ICPLS_TEMPLATE = 6;   // existing "Cliqbux Template Swipe Keyed"

// ─── Static field sets ────────────────────────────────────────────────────────

// Fields that are identical for ALL Cliqbux merchants regardless of plan
const ALWAYS_STATIC = {
  country_formation:               'USA',
  country_operations:              'USA',
  beneficial_ownership_exemption:  'NON',
  has_intermediary_businesses:     false,
  owner_confirmed:                 true,
  has_legal_address:               'business',
  statement_delivery_method:       'E',
  chargebacks_retrievals_format:   'WM',
  billing_method:                  'N',
  cards_accepted:                  ['VISA', 'VISA_DEBIT', 'MASTERCARD', 'MASTERCARD_DEBIT', 'DISCOVER', 'AMEX'],
  auth_pricing_program:            '49999',
  all_card_auth_per_item:          '0.050',
  intl_card_handling_fee:          '0.60',
  tokenization_service_fee:        '0.0000',
  tokenization_platform_fee:       '0.0000',
  // Interchange passthrough markups — Cliqbux standard
  all_markup_discount:             '0.0000',
  all_markup_per_item:             '0.000',
};

// ICPLS (interchange cost plus) — swipe and keyed share the same plan structure
const ICPLS_STATIC = {
  ...ALWAYS_STATIC,
  pricing_method:       'ICPLS',
  pricing_category:     '1',       // Retail — merchant-specific form fill overrides this per MCC
  card_acceptance_split: 'CP',     // default card-present; overridden to OMNI for keyed merchants
};

// Cash Discount — surcharge passed to cardholder; MSPWare uses "CLEAR" as the pricing_method value
const CD_STATIC = {
  ...ALWAYS_STATIC,
  pricing_method:       'CLEAR',
  pricing_category:     '1',
  card_acceptance_split: 'CP',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body   = await req.json();
    const { action, templateNo } = body;

    const mspBase = (Deno.env.get('MSP_BASE_URL') || 'https://api.msppulsepoint.com/v2').replace(/\/$/, '');
    const apiKey  = Deno.env.get('MSP_APP_KEY') || '';
    const appId   = Deno.env.get('MSP_APP_ID') || 'cliqbux';
    const salespersonId = parseInt(Deno.env.get('MSP_SALESPERSON_ID') || '0', 10);

    if (!apiKey) return Response.json({ error: 'MSP_APP_KEY not set' }, { status: 500 });

    const headers = {
      'X-API-KEY':    apiKey,
      'X-App-ID':     appId,
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    };

    // ── read ─────────────────────────────────────────────────────────────────
    if (action === 'read') {
      const no = templateNo || ICPLS_TEMPLATE;
      const res  = await fetch(`${mspBase}/applications/${no}/form`, { headers });
      const data = await res.json();
      return Response.json({
        success: res.ok,
        templateNo: no,
        percentComplete: data?.percent_complete,
        canSave: data?.canSave,
        fields: data,
      });
    }

    // ── list ─────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const res  = await fetch(`${mspBase}/applications?status=template`, { headers });
      const data = await res.json();
      return Response.json({ success: res.ok, status: res.status, data });
    }

    // ── fill_icpls ────────────────────────────────────────────────────────────
    if (action === 'fill_icpls') {
      const no  = templateNo || ICPLS_TEMPLATE;
      const res = await fetch(`${mspBase}/applications/${no}/form`, {
        method:  'PUT',
        headers,
        body:    JSON.stringify(ICPLS_STATIC),
      });
      const data = await res.json();
      console.log(`[manageMSPTemplate] fill_icpls → template ${no}: ${data?.percent_complete ?? '?'}% complete`);
      return Response.json({
        success:         res.ok && (data?.canSave !== false),
        templateNo:      no,
        percentComplete: data?.percent_complete,
        canSave:         data?.canSave,
        errors: [
          ...(data?.data_errors        || []),
          ...(data?.completion_errors  || []),
          ...(data?.rule_violations    || []),
        ],
        raw: data,
      });
    }

    // ── fill_cd ───────────────────────────────────────────────────────────────
    if (action === 'fill_cd') {
      const no  = templateNo;
      if (!no) return Response.json({ error: 'templateNo required for fill_cd' }, { status: 400 });
      const res = await fetch(`${mspBase}/applications/${no}/form`, {
        method:  'PUT',
        headers,
        body:    JSON.stringify(CD_STATIC),
      });
      const data = await res.json();
      console.log(`[manageMSPTemplate] fill_cd → template ${no}: ${data?.percent_complete ?? '?'}% complete`);
      return Response.json({
        success:         res.ok && (data?.canSave !== false),
        templateNo:      no,
        percentComplete: data?.percent_complete,
        canSave:         data?.canSave,
        errors: [
          ...(data?.data_errors        || []),
          ...(data?.completion_errors  || []),
          ...(data?.rule_violations    || []),
        ],
        raw: data,
      });
    }

    // ── create_cd ─────────────────────────────────────────────────────────────
    if (action === 'create_cd') {
      // Step 1: Create a new template application
      const createBody = {
        dba:                          'Cliqbux Template Cash Discount',
        merchantapplicationtypeno:    MSP_APP_TYPE,
        salespersonid:                salespersonId,
        // No templatemerchantapplicationno — start fresh for CD
      };
      const createRes  = await fetch(`${mspBase}/applications`, {
        method:  'POST',
        headers,
        body:    JSON.stringify(createBody),
      });
      const createData = await createRes.json();
      console.log(`[manageMSPTemplate] create_cd application:`, JSON.stringify(createData));

      if (!createRes.ok || !createData.success) {
        return Response.json({
          success: false,
          error:   createData?.error || createData?.message || `HTTP ${createRes.status}`,
          raw:     createData,
        });
      }

      const newTemplateNo = createData.merchantapplicationno;

      // Step 2: Fill with Cash Discount static fields
      const fillRes  = await fetch(`${mspBase}/applications/${newTemplateNo}/form`, {
        method:  'PUT',
        headers,
        body:    JSON.stringify(CD_STATIC),
      });
      const fillData = await fillRes.json();
      console.log(`[manageMSPTemplate] create_cd fill → ${newTemplateNo}: ${fillData?.percent_complete ?? '?'}% complete`);

      return Response.json({
        success:         fillRes.ok,
        newTemplateNo,
        percentComplete: fillData?.percent_complete,
        canSave:         fillData?.canSave,
        note:            `Created Cash Discount template as application #${newTemplateNo}. Update CD_TEMPLATE_NO in submitToMSP and signApplication to use this number.`,
        errors: [
          ...(fillData?.data_errors       || []),
          ...(fillData?.completion_errors || []),
          ...(fillData?.rule_violations   || []),
        ],
        raw: fillData,
      });
    }

    return Response.json({ error: `Unknown action: ${action}. Valid: read, list, fill_icpls, fill_cd, create_cd` }, { status: 400 });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});