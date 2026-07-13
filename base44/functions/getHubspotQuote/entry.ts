import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

// ─── getHubspotQuote ──────────────────────────────────────────────────────────
// Pulls a HubSpot quote + line items for the post-signing Equipment Order panel.
// Payment collection stays on HubSpot Payments (quote page / iframe) — this
// function is read-only display data.
//
// POST /functions/getHubspotQuote
// Body: { corporateId, locationId? }
//
// Auth: merchant JWT must match corporateId; admin workspace session allowed.

const QUOTE_PROPS = [
  'hs_quote_link',
  'hs_quote_esign_status',
  'hs_payment_status',
  'hs_payment_date',
  'hs_payment_enabled',
  'hs_quote_amount',
  'hs_expiration_date',
  'hs_status',
  'hs_title',
  'hs_createdate',
].join(',');

const LINE_ITEM_PROPS = [
  'name',
  'quantity',
  'price',
  'amount',
  'hs_total_discount',
  'hs_discount_percentage',
  'hs_sku',
  'description',
  'recurringbillingfrequency',
  'hs_recurring_billing_period',
];

function classifyLineItem(props: Record<string, any>): 'recurring' | 'hardware' | 'service' {
  const freq = props.recurringbillingfrequency || props.hs_recurring_billing_period;
  if (freq != null && String(freq).trim() !== '' && String(freq).toLowerCase() !== 'null') {
    return 'recurring';
  }
  if (props.hs_sku != null && String(props.hs_sku).trim() !== '') {
    return 'hardware';
  }
  return 'service';
}

function sanitizeLineItem(id: string, props: Record<string, any>) {
  const kind = classifyLineItem(props);
  return {
    id: String(id),
    name: props.name || '',
    quantity: props.quantity != null ? Number(props.quantity) : null,
    price: props.price != null ? Number(props.price) : null,
    amount: props.amount != null ? Number(props.amount) : null,
    discountTotal: props.hs_total_discount != null ? Number(props.hs_total_discount) : null,
    discountPct: props.hs_discount_percentage != null ? Number(props.hs_discount_percentage) : null,
    sku: props.hs_sku || '',
    description: props.description || '',
    recurringFrequency: props.recurringbillingfrequency || props.hs_recurring_billing_period || null,
    kind,
  };
}

async function hsGet(path: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.hubapi.com${path}`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HubSpot GET ${path} → ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

async function resolveQuoteIdFromDeal(
  corporateId: string,
  headers: Record<string, string>
): Promise<{ quoteId: string; quoteUrl: string } | null> {
  const deal = await hsGet(
    `/crm/v3/objects/deals/${corporateId}?properties=dealname&associations=quotes`,
    headers
  );
  const quoteAssocs = deal.associations?.quotes?.results || [];
  const seen = new Set<string>();
  const candidates: any[] = [];
  for (const qa of quoteAssocs) {
    if (seen.has(String(qa.id))) continue;
    seen.add(String(qa.id));
    if (candidates.length >= 5) break;
    try {
      const q = await hsGet(
        `/crm/v3/objects/quotes/${qa.id}?properties=${QUOTE_PROPS}`,
        headers
      );
      candidates.push({ id: String(qa.id), ...(q.properties || {}) });
    } catch {
      /* skip unreadable quote */
    }
  }
  const linked = candidates
    .filter((q) => q.hs_quote_link)
    .sort((a, b) => String(b.hs_createdate || '').localeCompare(String(a.hs_createdate || '')));
  if (!linked.length) return null;
  return { quoteId: String(linked[0].id), quoteUrl: linked[0].hs_quote_link || '' };
}

async function backfillQuoteIdOnLocations(base44: any, corporateId: string, quoteId: string) {
  try {
    const locs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }) || [];
    for (const loc of locs) {
      if (String(loc.hubspotQuoteId || '') === quoteId) continue;
      await base44.asServiceRole.entities.MerchantLocations.update(loc.id, { hubspotQuoteId: quoteId });
    }
  } catch (e: any) {
    console.warn(`[getHubspotQuote] backfill hubspotQuoteId failed: ${e.message}`);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const bodyCorporateId = body.corporateId != null ? String(body.corporateId) : '';
    const locationId = body.locationId != null ? String(body.locationId) : '';

    const actor = await getPortalActor(req, base44);
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (actor.actor === 'merchant') {
      if (!bodyCorporateId || actor.corporateId !== bodyCorporateId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const corporateId = actor.actor === 'merchant' ? String(actor.corporateId) : bodyCorporateId;
    if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });

    const hsKey = Deno.env.get('HUBSPOT_API_KEY');
    if (!hsKey) return Response.json({ error: 'HUBSPOT_API_KEY not set' }, { status: 500 });

    const headers = {
      Authorization: `Bearer ${hsKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // ── Resolve quote id ────────────────────────────────────────────────────
    let quoteId = '';
    if (locationId) {
      const locs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }) || [];
      const match = locs.find((l: any) => String(l.id) === locationId || String(l.locationId) === locationId);
      if (!match) return Response.json({ error: 'Location not found' }, { status: 404 });
      quoteId = String(match.hubspotQuoteId || '');
    }
    if (!quoteId) {
      const locs = await base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }) || [];
      const withQuote = locs.find((l: any) => l.hubspotQuoteId);
      if (withQuote) quoteId = String(withQuote.hubspotQuoteId);
    }

    let resolvedFromDeal = false;
    if (!quoteId) {
      const fromDeal = await resolveQuoteIdFromDeal(corporateId, headers);
      if (fromDeal?.quoteId) {
        quoteId = fromDeal.quoteId;
        resolvedFromDeal = true;
        await backfillQuoteIdOnLocations(base44, corporateId, quoteId);
      }
    }

    if (!quoteId) {
      return Response.json({
        success: true,
        quoteId: null,
        quoteUrl: null,
        esignStatus: null,
        paymentStatus: null,
        paymentEnabled: false,
        amount: null,
        lineItems: [],
        hardware: [],
        recurring: [],
        oneTimeServices: [],
        message: 'No HubSpot quote associated with this deal yet',
      });
    }

    // ── 1. Quote + line_item associations ───────────────────────────────────
    const quote = await hsGet(
      `/crm/v3/objects/quotes/${quoteId}?associations=line_items&properties=${QUOTE_PROPS}`,
      headers
    );
    const qp = quote.properties || {};
    const lineAssocs = quote.associations?.['line items']?.results
      || quote.associations?.line_items?.results
      || [];

    // ── 2. Batch-read line items ────────────────────────────────────────────
    const lineIds = [...new Set(lineAssocs.map((a: any) => String(a.id)).filter(Boolean))];
    let rawItems: any[] = [];
    if (lineIds.length) {
      const batchRes = await fetch('https://api.hubapi.com/crm/v3/objects/line_items/batch/read', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          properties: LINE_ITEM_PROPS,
          inputs: lineIds.map((id) => ({ id })),
        }),
      });
      if (!batchRes.ok) {
        const txt = await batchRes.text();
        throw new Error(`HubSpot line_items batch/read → ${batchRes.status}: ${txt.slice(0, 200)}`);
      }
      const batchJson = await batchRes.json();
      rawItems = batchJson.results || [];
    }

    const lineItems = rawItems.map((item: any) => sanitizeLineItem(item.id, item.properties || {}));
    const hardware = lineItems.filter((i) => i.kind === 'hardware');
    const recurring = lineItems.filter((i) => i.kind === 'recurring');
    const oneTimeServices = lineItems.filter((i) => i.kind === 'service');

    // Stamp equipmentPaidAt once when we observe PAID (commerce only — not MID Active)
    if (String(qp.hs_payment_status || '').toUpperCase() === 'PAID') {
      try {
        const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId }) || [];
        if (profiles[0] && !profiles[0].equipmentPaidAt) {
          await base44.asServiceRole.entities.MerchantCorporateProfile.update(profiles[0].id, {
            equipmentPaidAt: qp.hs_payment_date || new Date().toISOString(),
          });
        }
      } catch (e: any) {
        console.warn(`[getHubspotQuote] equipmentPaidAt stamp failed: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      quoteId: String(quoteId),
      quoteUrl: qp.hs_quote_link || null,
      esignStatus: qp.hs_quote_esign_status || null,
      paymentStatus: qp.hs_payment_status || null,
      paymentDate: qp.hs_payment_date || null,
      paymentEnabled: qp.hs_payment_enabled === 'true' || qp.hs_payment_enabled === true,
      amount: qp.hs_quote_amount != null ? Number(qp.hs_quote_amount) : null,
      expirationDate: qp.hs_expiration_date || null,
      title: qp.hs_title || null,
      lineItems,
      hardware,
      recurring,
      oneTimeServices,
      resolvedFromDeal,
    });
  } catch (error: any) {
    console.error('[getHubspotQuote]', error.message);
    return Response.json({
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join(' | '),
    }, { status: 500 });
  }
});
