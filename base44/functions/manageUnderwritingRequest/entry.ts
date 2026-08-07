/**
 * manageUnderwritingRequest — admin-only Deal Room underwriting document requests (W-9 v1).
 *
 * Actions:
 *   list          { corporateId, midId? }
 *   create        { corporateId, midId, legalEntityId, recipientName, recipientEmail?, recipientPhone?, channels, agentNote? }
 *   send          { requestId }
 *   resend        { requestId }
 *   cancel        { requestId }
 *   getSignedUrl  { requestId }
 *   sendToElavon  { requestId, to, subject, bodyText }
 *
 * Auth: workspace session only — merchant JWTs rejected (same pattern as syncUnderwritingMail).
 * Magic link: ${PUBLIC_APP_URL}/uw/${rawToken}
 * Token store: sha256(token + MERCHANT_JWT_SECRET) → tokenHash (never store raw token).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const TOKEN_TTL_DAYS = 7;
const QUO_API_VERSION = '2026-03-30';
const DEFAULT_MAILBOX = 'underwriting@cliqbux.com';
const REQUEST_TYPE = 'w9';
const NON_TERMINAL = new Set(['draft', 'sent', 'opened', 'send_failed']);
const SIGNED_STATUSES = new Set(['signed', 'sent_to_elavon']);

// --- BEGIN w9Prefill (sync with src/lib/w9Prefill.js + w9Model.js) ---

function emptyW9Fields() {
  return {
    name: '',
    businessName: '',
    taxClassification: '',
    llcTaxClass: '',
    otherClassification: '',
    exemptPayeeCode: '',
    fatcaCode: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    tinType: 'ein',
    tin: '',
    signatureName: '',
    signedAt: '',
  };
}

function mapLlcTaxClass(taxClassType: string): string {
  switch (taxClassType) {
    case 'LLC_CORPORATION':
      return 'C';
    case 'LLC':
    case 'DISREGARDED_ENTITY':
      return 'D';
    case 'LLC_PARTNERSHIP':
      return 'P';
    default:
      return '';
  }
}

function mapOwnershipToW9TaxClass(ownershipType: unknown, taxClassType: unknown) {
  const ownership = String(ownershipType || '').toUpperCase();
  const taxClass = String(taxClassType || '').toUpperCase();

  if (ownership === 'SOLE_PROPRIETOR' || ownership === 'SOLE_PROPRIETORSHIP') {
    return { taxClassification: 'individual' };
  }
  if (ownership === 'SUB_S_CORP') {
    return { taxClassification: 's_corp' };
  }
  if (ownership === 'CORPORATION') {
    return { taxClassification: 'c_corp' };
  }
  if (ownership === 'LIMITED_COMPANY') {
    const llcTaxClass = mapLlcTaxClass(taxClass);
    return { taxClassification: 'llc', ...(llcTaxClass ? { llcTaxClass } : {}) };
  }
  if (ownership === 'GENERAL_PARTNERSHIP' || ownership === 'LIMITED_PARTNERSHIP') {
    return { taxClassification: 'partnership' };
  }
  if (ownership === 'NON_PROFIT') {
    return { taxClassification: 'other', otherClassification: 'Non-profit' };
  }
  if (ownership === 'TRUST') {
    return { taxClassification: 'trust' };
  }
  return { taxClassification: '' };
}

function extractEinDigits(federalEIN: unknown): string {
  if (federalEIN == null || federalEIN === '') return '';
  return String(federalEIN).replace(/\D/g, '').slice(0, 9);
}

function hasAddress(addr: { street?: string; city?: string; state?: string; zip?: string }): boolean {
  return Boolean(addr.street && addr.city && addr.state && addr.zip);
}

function pickMailingAddress(entity: any) {
  const street = [entity?.mailingStreet, entity?.mailingStreet2].filter(Boolean).join(', ').trim();
  return {
    street,
    city: String(entity?.mailingCity || '').trim(),
    state: String(entity?.mailingState || '').trim(),
    zip: String(entity?.mailingZip || '').trim(),
  };
}

function pickStoreAddress(location: any) {
  const loc = location || {};
  const street = [loc.businessStreet, loc.businessStreet2].filter(Boolean).join(', ').trim();
  return {
    street,
    city: String(loc.businessCity || '').trim(),
    state: String(loc.businessState || '').trim(),
    zip: String(loc.businessZip || '').trim(),
  };
}

/** Build best-effort W-9 prefill from legal entity (+ optional control person / location). TIN never invented. */
function buildW9Prefill({
  legalEntity,
  controlPerson,
  locationFallback,
}: {
  legalEntity?: any;
  controlPerson?: any;
  locationFallback?: any;
} = {}) {
  const entity = legalEntity || {};
  const fields = emptyW9Fields();

  const businessName = String(entity.legalBusinessName || '').trim();
  fields.businessName = businessName;

  const ownershipType = entity.ownershipType || '';
  const taxClassType = entity.taxClassType || '';
  const taxMapping = mapOwnershipToW9TaxClass(ownershipType, taxClassType) as any;
  fields.taxClassification = taxMapping.taxClassification || '';
  if (taxMapping.llcTaxClass) fields.llcTaxClass = taxMapping.llcTaxClass;
  if (taxMapping.otherClassification) fields.otherClassification = taxMapping.otherClassification;

  const isSoleProp =
    ownershipType === 'SOLE_PROPRIETOR' || ownershipType === 'SOLE_PROPRIETORSHIP';
  if (isSoleProp && controlPerson) {
    const first = String(controlPerson.firstName || controlPerson.firstname || '').trim();
    const last = String(controlPerson.lastName || controlPerson.lastname || '').trim();
    fields.name = [first, last].filter(Boolean).join(' ');
  } else {
    fields.name = businessName;
  }

  const mailingAddress = pickMailingAddress(entity);
  const storeAddress = pickStoreAddress(locationFallback);
  const addressSource = hasAddress(mailingAddress) ? mailingAddress : storeAddress;

  fields.address = addressSource.street;
  fields.city = addressSource.city;
  fields.state = addressSource.state;
  fields.zip = addressSource.zip;

  fields.tin = extractEinDigits(entity.federalEIN);
  fields.tinType = 'ein';

  return fields;
}

// --- END w9Prefill ---

function __b64uDecode(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4;
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function requireAdmin(req: Request, base44: any): Promise<boolean> {
  try {
    const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
    const parts = m ? m[1].split('.') : [];
    const secret = Deno.env.get('MERCHANT_JWT_SECRET');
    if (parts.length === 3 && secret) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const ok = await crypto.subtle.verify(
        'HMAC',
        key,
        __b64uDecode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
      if (ok) return false;
    }
  } catch { /* ignore */ }
  try {
    const user = await base44.auth.me();
    return !!user;
  } catch {
    return false;
  }
}

function getPortalBaseUrl(): string {
  const configured = Deno.env.get('PUBLIC_APP_URL');
  if (configured && configured.startsWith('http')) return configured.replace(/\/$/, '');
  return 'https://cliqbux-onboard-prime.base44.app';
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(rawToken: string): Promise<string> {
  const secret = Deno.env.get('MERCHANT_JWT_SECRET');
  if (!secret) throw new Error('MERCHANT_JWT_SECRET not set');
  const data = new TextEncoder().encode(`${rawToken}${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (String(raw || '').trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
  return null;
}

function normalizeChannels(raw: unknown): 'email' | 'sms' | 'both' {
  const v = String(raw || 'both').toLowerCase().trim();
  if (v === 'sms' || v === 'email') return v;
  return 'both';
}

function parseLegalEntities(raw: unknown): any[] {
  let entities: any = raw ?? [];
  if (typeof entities === 'string') {
    try { entities = JSON.parse(entities); } catch { entities = []; }
  }
  return Array.isArray(entities) ? entities : [];
}

function parsePrefillSnapshot(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function tinMaskedFromSnapshot(snapshot: Record<string, any> | null): string | null {
  if (!snapshot) return null;
  const digits = String(snapshot.tin || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length <= 4) return `••••${digits}`;
  return `••••${digits.slice(-4)}`;
}

function stripTinFromListRow(row: any): any {
  const snapshot = parsePrefillSnapshot(row?.prefillSnapshot);
  const tinMasked = tinMaskedFromSnapshot(snapshot);
  const { tokenHash: _th, ...rest } = row || {};
  let safeSnapshot: string | undefined;
  if (snapshot) {
    const { tin: _tin, ...restFields } = snapshot;
    safeSnapshot = JSON.stringify({ ...restFields, tinMasked: tinMasked || undefined });
  } else if (row?.prefillSnapshot != null) {
    safeSnapshot = typeof row.prefillSnapshot === 'string'
      ? row.prefillSnapshot
      : JSON.stringify(row.prefillSnapshot);
  }
  return {
    ...rest,
    prefillSnapshot: safeSnapshot,
    tinMasked: tinMasked || null,
  };
}

function isControlPerson(s: any): boolean {
  if (!s || s.isPortalAdmin === true) return false;
  if (s.isAuthorizedSigner === true) return true;
  if (s.isAuthorizedSigner == null && s.isPrimarySigner === true) return true;
  return false;
}

function entityMissingError(e: any): boolean {
  const msg = String(e?.message || e || '').toLowerCase();
  return msg.includes('not found') || msg.includes('unknown entity') || msg.includes('does not exist')
    || msg.includes('entity') && msg.includes('missing');
}

async function getGmailAccessToken(): Promise<string> {
  const direct = Deno.env.get('UNDERWRITING_GMAIL_ACCESS_TOKEN');
  if (direct) return direct;

  const clientId = Deno.env.get('UNDERWRITING_GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('UNDERWRITING_GMAIL_CLIENT_SECRET');
  const refreshToken = Deno.env.get('UNDERWRITING_GMAIL_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail not configured. Set UNDERWRITING_GMAIL_CLIENT_ID, UNDERWRITING_GMAIL_CLIENT_SECRET, and UNDERWRITING_GMAIL_REFRESH_TOKEN (or UNDERWRITING_GMAIL_ACCESS_TOKEN).',
    );
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Gmail token refresh failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return String(data.access_token);
}

const CLIQBUX_EMAIL_LOGO_CID = 'cliqbux-logo';
const CLIQBUX_EMAIL_LOGO_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function emailLogoHeaderHtml(): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" align="center" style="margin:0 auto;">
  <tr>
    <td style="vertical-align:middle;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.03em;font-family:Poppins,Inter,Arial,sans-serif;line-height:1;">cliqbux</td>
  </tr>
</table>`;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildW9EmailHtml(recipientName: string, link: string, businessLabel: string, agentNote?: string): string {
  const who = escapeHtml(String(recipientName || '').trim() || 'there');
  const biz = escapeHtml(String(businessLabel || '').trim() || 'your business');
  const noteBlock = agentNote
    ? `<p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.5;border-left:3px solid #FEAC27;padding-left:12px;">${escapeHtml(agentNote)}</p>`
    : '';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center">
  <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;">
    <tr><td style="background:#111827;padding:28px 40px;text-align:center;">${emailLogoHeaderHtml()}</td></tr>
    <tr><td style="padding:36px 40px;">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827;">Action needed: sign your W-9</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
        Hi ${who},<br><br>
        Cliqbux needs a signed IRS Form W-9 for <strong>${biz}</strong> to complete underwriting with Elavon. Please review the prefilled details, make any corrections, and sign — it only takes a few minutes.
      </p>
      ${noteBlock}
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#FEAC27;color:#111;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;">Review &amp; sign W-9 →</a>
      <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;line-height:1.5;">This link expires in ${TOKEN_TTL_DAYS} days. If you did not expect this message, you can ignore it.</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}

/** SMS must never include TIN. */
function buildW9Sms(recipientName: string, link: string, businessLabel: string): string {
  const who = String(recipientName || '').trim().split(/\s+/)[0] || 'there';
  const biz = String(businessLabel || '').trim() || 'your business';
  return `Hi ${who}, Cliqbux needs your signed W-9 for ${biz}: ${link}\nReply here if you need help.`;
}

async function sendViaResend(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Cliqbux Onboarding <onboarding@onboarding.cliqbuxpos.com>',
      to: [to],
      subject,
      html,
      attachments: [{
        filename: 'cliqbux-mark.png',
        content: CLIQBUX_EMAIL_LOGO_B64,
        content_id: CLIQBUX_EMAIL_LOGO_CID,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
}

async function sendViaQuo(toE164: string, content: string): Promise<void> {
  const apiKey = Deno.env.get('QUO_API_KEY');
  const from = Deno.env.get('QUO_FROM_NUMBER');
  if (!apiKey) throw new Error('QUO_API_KEY not set — add Cliqbux Quo API key in Base44 env');
  if (!from) throw new Error('QUO_FROM_NUMBER not set — Cliqbux Quo number in E.164 (e.g. +15551234567)');

  const res = await fetch('https://api.quo.com/v1/messages', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      'Quo-Api-Version': QUO_API_VERSION,
    },
    body: JSON.stringify({
      content,
      from,
      to: [toE164],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Quo SMS failed (${res.status}): ${err}`);
  }
}

function encodeQuotedPrintableSafe(text: string): string {
  // Prefer base64 body parts for simplicity / UTF-8 safety
  return bytesToBase64(new TextEncoder().encode(text));
}

function buildMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  pdfBytes: Uint8Array;
  pdfFilename: string;
}): string {
  const boundary = `cliqbux_uw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const subjectEncoded = /[^\x20-\x7E]/.test(opts.subject)
    ? `=?UTF-8?B?${bytesToBase64(new TextEncoder().encode(opts.subject))}?=`
    : opts.subject;

  const textB64 = encodeQuotedPrintableSafe(opts.bodyText);
  const pdfB64 = bytesToBase64(opts.pdfBytes);
  // Wrap base64 at 76 chars per RFC
  const wrap76 = (s: string) => s.replace(/.{1,76}/g, (m) => `${m}\r\n`).trimEnd();

  return [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(textB64),
    '',
    `--${boundary}`,
    `Content-Type: application/pdf; name="${opts.pdfFilename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${opts.pdfFilename}"`,
    '',
    wrap76(pdfB64),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function isGmailScopeError(status: number, detail: any): boolean {
  const blob = JSON.stringify(detail || {}).toLowerCase();
  if (status === 403) return true;
  return blob.includes('insufficient') || blob.includes('gmail.send')
    || blob.includes('access_denied') || blob.includes('insufficientauthenticationscopes')
    || blob.includes('scope');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    if (!(await requireAdmin(req, base44))) {
      return Response.json({ error: 'Unauthorized — admin only' }, { status: 401 });
    }

    const user = await base44.auth.me().catch(() => null);
    const authorEmail = String(user?.email || '').trim();

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    const elavonDocsToHint = String(Deno.env.get('UNDERWRITING_ELAVON_DOCS_TO') || '').trim() || null;

    // ── list ────────────────────────────────────────────────────────────────
    if (action === 'list') {
      const corporateId = String(body.corporateId || '').trim();
      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
      const midId = String(body.midId || '').trim();

      let rows: any[] = [];
      try {
        const filter: Record<string, string> = { corporateId };
        if (midId) filter.midId = midId;
        rows = await base44.asServiceRole.entities.UnderwritingRequest.filter(
          filter,
          '-created_date',
          200,
        );
      } catch (e: any) {
        return Response.json({
          error: 'UnderwritingRequest entity missing — publish schema in Base44 Dashboard, then retry.',
          detail: e?.message,
          code: 'ENTITY_SCHEMA_MISSING',
        }, { status: 503 });
      }

      const requests = (rows || []).map(stripTinFromListRow);
      return Response.json({
        success: true,
        requests,
        elavonDocsToHint,
      });
    }

    // ── create ──────────────────────────────────────────────────────────────
    if (action === 'create') {
      const corporateId = String(body.corporateId || '').trim();
      const midId = String(body.midId || '').trim();
      const legalEntityId = String(body.legalEntityId || '').trim();
      const recipientName = String(body.recipientName || '').trim();
      const recipientEmail = String(body.recipientEmail || '').trim().toLowerCase();
      const recipientPhoneRaw = String(body.recipientPhone || '').trim();
      const channels = normalizeChannels(body.channels);
      const agentNote = String(body.agentNote || '').trim();

      if (!corporateId) return Response.json({ error: 'corporateId required' }, { status: 400 });
      if (!midId) return Response.json({ error: 'midId required' }, { status: 400 });
      if (!legalEntityId) return Response.json({ error: 'legalEntityId required' }, { status: 400 });
      if (!recipientName) return Response.json({ error: 'recipientName required' }, { status: 400 });

      const profiles = await base44.asServiceRole.entities.MerchantCorporateProfile.filter({ corporateId });
      const profile = profiles?.[0];
      if (!profile) return Response.json({ error: 'Merchant profile not found' }, { status: 404 });

      let mid: any;
      try {
        mid = await base44.asServiceRole.entities.MerchantMID.get(midId);
      } catch {
        return Response.json({ error: 'MID not found' }, { status: 404 });
      }
      if (!mid || String(mid.corporateId) !== corporateId) {
        return Response.json({ error: 'MID not found for this deal' }, { status: 404 });
      }

      let account: any = null;
      const accountId = profile.merchantAccountId ? String(profile.merchantAccountId) : '';
      if (accountId) {
        try {
          account = await base44.asServiceRole.entities.MerchantAccount.get(accountId);
        } catch { /* optional */ }
      }
      const entities = parseLegalEntities(
        account?.legalEntities != null ? account.legalEntities : profile.legalEntities,
      );
      const legalEntity = entities.find((e: any) => String(e.entityId) === legalEntityId);
      if (!legalEntity) {
        return Response.json({ error: 'Legal entity not found on this deal/account' }, { status: 404 });
      }

      const [signers, locations] = await Promise.all([
        base44.asServiceRole.entities.MerchantSigners.filter({ corporateId }),
        base44.asServiceRole.entities.MerchantLocations.filter({ corporateId }),
      ]);
      const control = (signers || []).find(isControlPerson)
        || (signers || []).find((s: any) => s.isPrimarySigner)
        || (signers || [])[0];
      const locationFallback = (locations || []).find((l: any) => String(l.id) === String(mid.locationId))
        || (locations || [])[0];

      const prefill = buildW9Prefill({
        legalEntity,
        controlPerson: control,
        locationFallback,
      });

      // Enforce one non-terminal per midId+type — cancel prior unsigned
      try {
        const existing = await base44.asServiceRole.entities.UnderwritingRequest.filter(
          { midId, type: REQUEST_TYPE },
          '-created_date',
          50,
        );
        for (const row of existing || []) {
          if (row?.id && NON_TERMINAL.has(String(row.status || ''))) {
            await base44.asServiceRole.entities.UnderwritingRequest.update(row.id, {
              status: 'cancelled',
              lastError: 'Superseded by new draft',
            });
          }
        }
      } catch (e: any) {
        if (entityMissingError(e)) {
          return Response.json({
            error: 'UnderwritingRequest entity missing — publish schema in Base44 Dashboard, then retry.',
            detail: e?.message,
            code: 'ENTITY_SCHEMA_MISSING',
          }, { status: 503 });
        }
        throw e;
      }

      const recipientPhone = normalizePhone(recipientPhoneRaw) || (recipientPhoneRaw || '');

      let request: any;
      try {
        request = await base44.asServiceRole.entities.UnderwritingRequest.create({
          corporateId,
          merchantAccountId: accountId || undefined,
          midId,
          legalEntityId,
          type: REQUEST_TYPE,
          status: 'draft',
          recipientName,
          recipientEmail: recipientEmail || undefined,
          recipientPhone: recipientPhone || undefined,
          channels,
          agentNote: agentNote || undefined,
          prefillSnapshot: JSON.stringify(prefill),
          createdByEmail: authorEmail || undefined,
        });
      } catch (e: any) {
        return Response.json({
          error: 'UnderwritingRequest entity missing — publish schema in Base44 Dashboard, then retry.',
          detail: e?.message,
          code: 'ENTITY_SCHEMA_MISSING',
        }, { status: 503 });
      }

      return Response.json({
        success: true,
        request: stripTinFromListRow(request),
        prefill,
        elavonDocsToHint,
      });
    }

    // Shared: load request by id
    async function loadRequest(requestId: string): Promise<{ request?: any; error?: Response }> {
      if (!requestId) {
        return { error: Response.json({ error: 'requestId required' }, { status: 400 }) };
      }
      try {
        const request = await base44.asServiceRole.entities.UnderwritingRequest.get(requestId);
        if (!request) {
          return { error: Response.json({ error: 'Request not found' }, { status: 404 }) };
        }
        return { request };
      } catch (e: any) {
        if (entityMissingError(e)) {
          return {
            error: Response.json({
              error: 'UnderwritingRequest entity missing — publish schema in Base44 Dashboard, then retry.',
              detail: e?.message,
              code: 'ENTITY_SCHEMA_MISSING',
            }, { status: 503 }),
          };
        }
        return { error: Response.json({ error: 'Request not found' }, { status: 404 }) };
      }
    }

    async function cancelOtherNonTerminal(midId: string, type: string, exceptId: string): Promise<void> {
      const existing = await base44.asServiceRole.entities.UnderwritingRequest.filter(
        { midId, type },
        '-created_date',
        50,
      );
      for (const row of existing || []) {
        if (!row?.id || row.id === exceptId) continue;
        if (NON_TERMINAL.has(String(row.status || ''))) {
          await base44.asServiceRole.entities.UnderwritingRequest.update(row.id, {
            status: 'cancelled',
            lastError: 'Superseded by send/resend',
          });
        }
      }
    }

    async function dispatchSend(request: any): Promise<Response> {
      const status = String(request.status || '');
      if (SIGNED_STATUSES.has(status)) {
        return Response.json({
          error: 'Request already signed — create a new W-9 request instead of resending.',
          code: 'ALREADY_SIGNED',
        }, { status: 422 });
      }
      if (status === 'cancelled' || status === 'expired') {
        return Response.json({
          error: `Cannot send a ${status} request — create a new draft.`,
          code: 'TERMINAL_STATUS',
        }, { status: 422 });
      }

      const channels = normalizeChannels(request.channels);
      const wantEmail = channels === 'email' || channels === 'both';
      const wantSms = channels === 'sms' || channels === 'both';
      const email = String(request.recipientEmail || '').trim().toLowerCase();
      const phone = normalizePhone(request.recipientPhone);

      if (wantEmail && !email) {
        return Response.json({
          error: 'recipientEmail required when channels includes email',
          code: 'CHANNEL_VALIDATION',
        }, { status: 422 });
      }
      if (wantSms && !phone) {
        return Response.json({
          error: 'recipientPhone required (E.164) when channels includes sms',
          code: 'CHANNEL_VALIDATION',
        }, { status: 422 });
      }

      await cancelOtherNonTerminal(String(request.midId), String(request.type || REQUEST_TYPE), request.id);

      let rawToken: string;
      let tokenHash: string;
      try {
        rawToken = generateToken();
        tokenHash = await hashToken(rawToken);
      } catch (e: any) {
        return Response.json({ error: e?.message || 'Token hashing failed' }, { status: 500 });
      }

      const now = new Date();
      const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const link = `${getPortalBaseUrl()}/uw/${rawToken}`;

      // Business label for copy — prefer snapshot businessName, never log TIN
      const snapshot = parsePrefillSnapshot(request.prefillSnapshot);
      const businessLabel = String(snapshot?.businessName || snapshot?.name || request.recipientName || '').trim();

      const channelResults: { email?: string; sms?: string; errors: string[] } = { errors: [] };

      if (wantEmail) {
        try {
          await sendViaResend(
            email,
            `Action needed: sign your W-9 for CliqBux / Elavon — ${businessLabel || 'merchant'}`,
            buildW9EmailHtml(request.recipientName, link, businessLabel, request.agentNote),
          );
          channelResults.email = 'sent';
        } catch (e: any) {
          channelResults.errors.push(`Email: ${e?.message || e}`);
        }
      }

      if (wantSms && phone) {
        try {
          await sendViaQuo(phone, buildW9Sms(request.recipientName, link, businessLabel));
          channelResults.sms = 'sent';
        } catch (e: any) {
          channelResults.errors.push(`SMS: ${e?.message || e}`);
        }
      }

      const anyOk = channelResults.email === 'sent' || channelResults.sms === 'sent';
      const sentAt = now.toISOString();

      if (!anyOk) {
        const lastError = channelResults.errors.join(' · ') || 'Send failed';
        const updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
          status: 'send_failed',
          lastError,
          tokenHash,
          tokenExpiresAt,
        });
        return Response.json({
          error: lastError,
          code: 'SEND_FAILED',
          request: stripTinFromListRow(updated),
          results: channelResults,
        }, { status: 422 });
      }

      const updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
        status: 'sent',
        sentAt,
        tokenHash,
        tokenExpiresAt,
        lastError: channelResults.errors.length ? channelResults.errors.join(' · ') : '',
        recipientPhone: phone || request.recipientPhone,
      });

      return Response.json({
        success: true,
        request: stripTinFromListRow(updated),
        results: channelResults,
        warnings: channelResults.errors.length ? channelResults.errors : undefined,
        elavonDocsToHint,
        // Raw token intentionally omitted — magic link is delivered via email/SMS only
      });
    }

    // ── send ────────────────────────────────────────────────────────────────
    if (action === 'send') {
      const loaded = await loadRequest(String(body.requestId || '').trim());
      if (loaded.error) return loaded.error;
      return await dispatchSend(loaded.request);
    }

    // ── resend ──────────────────────────────────────────────────────────────
    if (action === 'resend') {
      const loaded = await loadRequest(String(body.requestId || '').trim());
      if (loaded.error) return loaded.error;
      const request = loaded.request;
      const status = String(request.status || '');

      // Prefer same row when still unsigned (including send_failed / draft / sent / opened)
      if (SIGNED_STATUSES.has(status)) {
        return Response.json({
          error: 'Already signed — create a new W-9 request to collect another signature.',
          code: 'ALREADY_SIGNED',
        }, { status: 422 });
      }
      if (status === 'cancelled' || status === 'expired') {
        // Revive cancelled/expired onto same row for agent convenience (brief: new or same)
        await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
          status: 'draft',
          lastError: '',
          tokenHash: '',
          tokenExpiresAt: '',
        });
        const refreshed = await base44.asServiceRole.entities.UnderwritingRequest.get(request.id);
        return await dispatchSend(refreshed);
      }
      return await dispatchSend(request);
    }

    // ── cancel ──────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      const loaded = await loadRequest(String(body.requestId || '').trim());
      if (loaded.error) return loaded.error;
      const request = loaded.request;
      const status = String(request.status || '');
      if (SIGNED_STATUSES.has(status)) {
        return Response.json({
          error: 'Cannot cancel a signed request',
          code: 'ALREADY_SIGNED',
        }, { status: 422 });
      }
      if (status === 'cancelled') {
        return Response.json({ success: true, request: stripTinFromListRow(request) });
      }
      const updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
        status: 'cancelled',
        lastError: '',
      });
      return Response.json({ success: true, request: stripTinFromListRow(updated) });
    }

    // ── getSignedUrl ────────────────────────────────────────────────────────
    if (action === 'getSignedUrl') {
      const loaded = await loadRequest(String(body.requestId || '').trim());
      if (loaded.error) return loaded.error;
      const request = loaded.request;
      const status = String(request.status || '');
      if (!SIGNED_STATUSES.has(status)) {
        return Response.json({
          error: 'Signed PDF not available until the merchant has signed',
          code: 'NOT_SIGNED',
        }, { status: 422 });
      }
      const signedPdfUrl = String(request.signedPdfUrl || '').trim();
      if (!signedPdfUrl) {
        return Response.json({
          error: 'signedPdfUrl missing on signed request',
          code: 'PDF_MISSING',
        }, { status: 404 });
      }
      return Response.json({
        success: true,
        signedPdfUrl,
        status,
        elavonDocsToHint,
      });
    }

    // ── sendToElavon ────────────────────────────────────────────────────────
    if (action === 'sendToElavon') {
      const loaded = await loadRequest(String(body.requestId || '').trim());
      if (loaded.error) return loaded.error;
      const request = loaded.request;
      const status = String(request.status || '');
      // Allow from signed or re-forward from sent_to_elavon (PDF still required)
      if (!SIGNED_STATUSES.has(status)) {
        return Response.json({
          error: 'Request must be signed before sending to Elavon',
          code: 'NOT_SIGNED',
        }, { status: 422 });
      }

      const to = String(body.to || '').trim();
      const subject = String(body.subject || '').trim();
      const bodyText = String(body.bodyText || body.body || '').trim();
      if (!to) {
        return Response.json({
          error: 'to is required — set the Elavon docs address in the confirm dialog (UNDERWRITING_ELAVON_DOCS_TO is a UI hint only)',
          code: 'TO_REQUIRED',
          elavonDocsToHint,
        }, { status: 422 });
      }
      if (!subject) return Response.json({ error: 'subject required' }, { status: 400 });
      if (!bodyText) return Response.json({ error: 'bodyText required' }, { status: 400 });

      const signedPdfUrl = String(request.signedPdfUrl || '').trim();
      if (!signedPdfUrl) {
        return Response.json({ error: 'signedPdfUrl missing', code: 'PDF_MISSING' }, { status: 404 });
      }

      let pdfBytes: Uint8Array;
      try {
        const pdfRes = await fetch(signedPdfUrl);
        if (!pdfRes.ok) {
          return Response.json({
            error: `Failed to fetch signed PDF (${pdfRes.status})`,
            code: 'PDF_FETCH_FAILED',
          }, { status: 502 });
        }
        pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
        if (!pdfBytes.length) {
          return Response.json({ error: 'Signed PDF is empty', code: 'PDF_EMPTY' }, { status: 502 });
        }
      } catch (e: any) {
        return Response.json({
          error: `Failed to fetch signed PDF: ${e?.message || e}`,
          code: 'PDF_FETCH_FAILED',
        }, { status: 502 });
      }

      let accessToken: string;
      try {
        accessToken = await getGmailAccessToken();
      } catch (e: any) {
        return Response.json({
          error: e?.message || 'Gmail not configured',
          configured: false,
          hint: 'Add UNDERWRITING_GMAIL_* env vars, then reconnect OAuth with gmail.send scope.',
          code: 'GMAIL_NOT_CONFIGURED',
        }, { status: 503 });
      }

      const mailbox = Deno.env.get('UNDERWRITING_GMAIL_USER') || DEFAULT_MAILBOX;
      const mime = buildMimeMessage({
        from: mailbox,
        to,
        subject,
        bodyText,
        pdfBytes,
        pdfFilename: 'W9-signed.pdf',
      });
      const raw = base64UrlEncode(new TextEncoder().encode(mime));

      const sendRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw }),
        },
      );
      const sendData = await sendRes.json().catch(() => ({}));

      if (!sendRes.ok) {
        if (isGmailScopeError(sendRes.status, sendData)) {
          return Response.json({
            error: 'Gmail send failed — OAuth token likely missing gmail.send scope',
            status: sendRes.status,
            detail: sendData,
            hint: 'Reconnect underwriting@ OAuth with https://www.googleapis.com/auth/gmail.send (keep gmail.readonly for sync), update UNDERWRITING_GMAIL_REFRESH_TOKEN in Base44.',
            code: 'GMAIL_SEND_SCOPE_MISSING',
            elavonDocsToHint,
          }, { status: 503 });
        }
        await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
          lastError: `Gmail send failed: ${sendRes.status} ${JSON.stringify(sendData)}`.slice(0, 500),
        }).catch(() => {});
        return Response.json({
          error: 'Gmail send failed',
          status: sendRes.status,
          detail: sendData,
          code: 'GMAIL_SEND_FAILED',
        }, { status: 502 });
      }

      const gmailMessageId = String(sendData.id || '').trim();
      const sentToElavonAt = new Date().toISOString();

      // Load MID for AWB on thread log
      let elavonAwb = '';
      try {
        const mid = await base44.asServiceRole.entities.MerchantMID.get(String(request.midId));
        elavonAwb = String(mid?.elavonAwb || '').trim();
      } catch { /* non-fatal */ }

      let uwMessage: any = null;
      try {
        uwMessage = await base44.asServiceRole.entities.UnderwritingMessage.create({
          corporateId: String(request.corporateId),
          midId: String(request.midId),
          elavonAwb,
          direction: 'outbound',
          subject,
          bodyText,
          fromAddress: mailbox,
          toAddress: to,
          messageDate: sentToElavonAt,
          externalId: gmailMessageId || undefined,
          source: 'gmail',
          snippet: `W-9 PDF → ${to}`.slice(0, 160),
        });
      } catch (e: any) {
        console.warn('[manageUnderwritingRequest] UnderwritingMessage create failed:', e?.message);
      }

      const updated = await base44.asServiceRole.entities.UnderwritingRequest.update(request.id, {
        status: 'sent_to_elavon',
        sentToElavonAt,
        elavonGmailMessageId: gmailMessageId || undefined,
        lastError: '',
      });

      return Response.json({
        success: true,
        request: stripTinFromListRow(updated),
        gmailMessageId: gmailMessageId || null,
        underwritingMessage: uwMessage,
        elavonDocsToHint,
      });
    }

    return Response.json({
      error: 'Unknown action',
      hint: 'Expected list | create | send | resend | cancel | getSignedUrl | sendToElavon',
    }, { status: 400 });
  } catch (error: any) {
    console.error('[manageUnderwritingRequest]', error?.message);
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});
