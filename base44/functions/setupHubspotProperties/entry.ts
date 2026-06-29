import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── setupHubspotProperties ───────────────────────────────────────────────────
// One-time admin function: creates all custom HubSpot Company properties
// needed by syncFromHubspot to pre-populate the onboarding portal.
//
// Safe to run multiple times — 409 (already exists) is treated as success.
//
// POST /functions/setupHubspotProperties
// Body: {} (no params needed — uses HUBSPOT_API_KEY env var)
//
// Properties created on the COMPANIES object:
//   ein                 — Federal EIN / TIN (9 digits, no dashes)
//   ownership_type      — LLC / CORPORATION / SOLE_PROP / PARTNERSHIP / OTHER
//   state_of_formation  — 2-letter state code where entity was formed
//   mcc_code            — 4-digit Merchant Category Code
//   dba_name            — DBA / trade name if different from company name
//   monthly_card_sales  — Estimated monthly card volume ($)
//   avg_ticket          — Average transaction amount ($)
//   card_present_pct    — % of transactions that are card-present (0–100)
//   pricing_tier        — Pricing program (TRADITIONAL / STANDARD / PREMIUM / CASH_DISCOUNT)
//
// Already exists (skipped):
//   legal_name          — Legal Name (HubSpot built-in custom already in your portal)
//   founded_year        — Year Founded (HubSpot standard property)

const COMPANY_PROPERTIES = [
  {
    name: 'ein',
    label: 'Federal EIN',
    description: 'Federal Employer Identification Number (9 digits, no dashes). Used for tax and underwriting purposes.',
    type: 'string',
    fieldType: 'text',
    groupName: 'companyinformation',
  },
  {
    name: 'ownership_type',
    label: 'Ownership Type',
    description: 'Legal structure of the business entity.',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'companyinformation',
    options: [
      { label: 'Sole Proprietor',          value: 'SOLE_PROP',     displayOrder: 0, hidden: false },
      { label: 'LLC',                       value: 'LLC',           displayOrder: 1, hidden: false },
      { label: 'Corporation',               value: 'CORPORATION',   displayOrder: 2, hidden: false },
      { label: 'Partnership',               value: 'PARTNERSHIP',   displayOrder: 3, hidden: false },
      { label: 'Non-Profit',                value: 'NON_PROFIT',    displayOrder: 4, hidden: false },
      { label: 'Government',                value: 'GOVERNMENT',    displayOrder: 5, hidden: false },
      { label: 'Other',                     value: 'OTHER',         displayOrder: 6, hidden: false },
    ],
  },
  {
    name: 'state_of_formation',
    label: 'State of Formation',
    description: 'Two-letter US state code where the legal entity was formed (e.g. TX, FL, CA).',
    type: 'string',
    fieldType: 'text',
    groupName: 'companyinformation',
  },
  {
    name: 'mcc_code',
    label: 'MCC Code',
    description: 'Merchant Category Code (4-digit). Used for payment processing underwriting.',
    type: 'string',
    fieldType: 'text',
    groupName: 'companyinformation',
  },
  {
    name: 'dba_name',
    label: 'DBA / Trade Name',
    description: 'Doing Business As name — the customer-facing brand name if different from the legal entity name.',
    type: 'string',
    fieldType: 'text',
    groupName: 'companyinformation',
  },
  {
    name: 'monthly_card_sales',
    label: 'Monthly Card Sales ($)',
    description: 'Estimated monthly card processing volume in US dollars.',
    type: 'number',
    fieldType: 'number',
    groupName: 'companyinformation',
  },
  {
    name: 'avg_ticket',
    label: 'Average Ticket ($)',
    description: 'Average individual transaction amount in US dollars.',
    type: 'number',
    fieldType: 'number',
    groupName: 'companyinformation',
  },
  {
    name: 'card_present_pct',
    label: 'Card Present %',
    description: 'Percentage of transactions where the card is physically present (swiped/tapped). 0–100.',
    type: 'number',
    fieldType: 'number',
    groupName: 'companyinformation',
  },
  {
    name: 'pricing_tier',
    label: 'Pricing Tier',
    description: 'Cliqbux pricing program for this location.',
    type: 'enumeration',
    fieldType: 'select',
    groupName: 'companyinformation',
    options: [
      { label: 'Traditional',    value: 'TRADITIONAL',    displayOrder: 0, hidden: false },
      { label: 'Standard',       value: 'STANDARD',       displayOrder: 1, hidden: false },
      { label: 'Premium',        value: 'PREMIUM',        displayOrder: 2, hidden: false },
      { label: 'Cash Discount',  value: 'CASH_DISCOUNT',  displayOrder: 3, hidden: false },
    ],
  },
];

// Deal-level custom properties
const DEAL_PROPERTIES = [
  {
    name: 'portal_url',
    label: 'Onboarding Portal URL',
    description: 'Direct link to this merchant\'s Cliqbux onboarding portal. Written automatically by syncFromHubspot.',
    type: 'string',
    fieldType: 'text',
    groupName: 'dealinformation',
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const headers = {
      'Authorization': `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
    };

    const results: Array<{ name: string; status: string; error?: string }> = [];

    for (const prop of COMPANY_PROPERTIES) {
      try {
        const res = await fetch('https://api.hubapi.com/crm/v3/properties/companies', {
          method: 'POST',
          headers,
          body: JSON.stringify(prop),
        });

        if (res.ok) {
          results.push({ name: prop.name, status: 'created' });
          console.log(`[setupHubspotProperties] Created: ${prop.name}`);
        } else if (res.status === 409) {
          // Already exists — that's fine
          results.push({ name: prop.name, status: 'already_exists' });
          console.log(`[setupHubspotProperties] Already exists: ${prop.name}`);
        } else {
          const err = await res.text();
          results.push({ name: prop.name, status: 'error', error: `${res.status}: ${err.slice(0, 200)}` });
          console.error(`[setupHubspotProperties] Error creating ${prop.name}:`, res.status, err.slice(0, 200));
        }
      } catch (e: any) {
        results.push({ name: prop.name, status: 'error', error: e.message });
      }
    }

    // Create deal properties
    for (const prop of DEAL_PROPERTIES) {
      try {
        const res = await fetch('https://api.hubapi.com/crm/v3/properties/deals', {
          method: 'POST',
          headers,
          body: JSON.stringify(prop),
        });
        if (res.ok) {
          results.push({ name: `deal.${prop.name}`, status: 'created' });
        } else if (res.status === 409) {
          results.push({ name: `deal.${prop.name}`, status: 'already_exists' });
        } else {
          const err = await res.text();
          results.push({ name: `deal.${prop.name}`, status: 'error', error: `${res.status}: ${err.slice(0, 200)}` });
        }
      } catch (e: any) {
        results.push({ name: `deal.${prop.name}`, status: 'error', error: e.message });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const existing = results.filter(r => r.status === 'already_exists').length;
    const errors = results.filter(r => r.status === 'error').length;

    return Response.json({
      success: errors === 0,
      summary: `${created} created, ${existing} already existed, ${errors} errors`,
      results,
    });

  } catch (error: any) {
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
